import base64
import io
import logging
import time
from datetime import datetime, timedelta

import jwt
from django.utils import timezone
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated
from rest_framework.throttling import AnonRateThrottle, UserRateThrottle

from accounts.authentication import (
    APPLICANT_SECRET,
    PHASE2_TOKEN_EXPIRY_HOURS,
    generate_applicant_token,
    generate_phase2_token,
)
from accounts.permissions import RolePermission
from applicants.models import Applicant
from interviews.models import Interview, InterviewAuditLog

try:
    import qrcode
except ImportError:
    qrcode = None

logger = logging.getLogger(__name__)


class MagicLoginView(APIView):
    """
    Validate applicant magic link token and return minimal data.
    """

    authentication_classes = []
    permission_classes = []
    throttle_classes = [AnonRateThrottle, UserRateThrottle]

    def get(self, request, token):
        logger.info("Magic login hit", extra={"remote_addr": request.META.get("REMOTE_ADDR")})
        try:
            payload = jwt.decode(token, APPLICANT_SECRET, algorithms=["HS256"])
        except jwt.ExpiredSignatureError:
            logger.info(
                "Magic login expired token",
                extra={"remote_addr": request.META.get("REMOTE_ADDR"), "http_status": status.HTTP_410_GONE},
            )
            return Response({"valid": False, "reason": "expired"}, status=status.HTTP_410_GONE)
        except jwt.InvalidTokenError as exc:
            time.sleep(1)
            logger.info(
                "Magic login invalid token",
                extra={
                    "remote_addr": request.META.get("REMOTE_ADDR"),
                    "reason": str(exc),
                    "http_status": status.HTTP_401_UNAUTHORIZED,
                },
            )
            return Response({"valid": False, "reason": str(exc)}, status=status.HTTP_401_UNAUTHORIZED)

        if payload.get("type") != "applicant":
            logger.info(
                "Magic login invalid token type",
                extra={"remote_addr": request.META.get("REMOTE_ADDR"), "http_status": status.HTTP_401_UNAUTHORIZED},
            )
            return Response({"valid": False, "reason": "invalid token type"}, status=status.HTTP_401_UNAUTHORIZED)
        applicant_id = payload.get("applicant_id")
        if not applicant_id:
            logger.info(
                "Magic login missing applicant",
                extra={"remote_addr": request.META.get("REMOTE_ADDR"), "http_status": status.HTTP_401_UNAUTHORIZED},
            )
            return Response({"valid": False, "reason": "invalid applicant"}, status=status.HTTP_401_UNAUTHORIZED)

        applicant = Applicant.objects.filter(id=applicant_id).first()
        if not applicant:
            logger.info(
                "Magic login applicant not found",
                extra={"remote_addr": request.META.get("REMOTE_ADDR"), "http_status": status.HTTP_401_UNAUTHORIZED},
            )
            return Response({"valid": False, "reason": "invalid applicant"}, status=status.HTTP_401_UNAUTHORIZED)

        phase = payload.get("phase") or "phase1"
        interview_id = payload.get("interview_id")

        if phase == "retake":
            candidates = Interview.objects.filter(
                applicant_id=applicant_id,
                archived=False,
                status__in=["pending", "in_progress"],
            ).order_by("-created_at")
            candidate_count = candidates.count()
            interview = candidates.first()
            logger.info(
                "Magic login retake candidates",
                extra={
                    "applicant_id": applicant_id,
                    "candidate_count": candidate_count,
                    "selected_interview_id": getattr(interview, "id", None),
                },
            )
        else:
            if not interview_id:
                logger.info(
                    "Magic login missing interview id",
                    extra={
                        "remote_addr": request.META.get("REMOTE_ADDR"),
                        "applicant_id": applicant_id,
                        "http_status": status.HTTP_404_NOT_FOUND,
                    },
                )
                return Response({"valid": False, "reason": "interview not found"}, status=status.HTTP_404_NOT_FOUND)
            interview = Interview.objects.filter(
                id=interview_id,
                applicant_id=applicant_id,
                archived=False,
            ).first()

        if not interview:
            logger.info(
                "Magic login interview not found",
                extra={
                    "remote_addr": request.META.get("REMOTE_ADDR"),
                    "applicant_id": applicant_id,
                    "http_status": status.HTTP_404_NOT_FOUND,
                },
            )
            return Response({"valid": False, "reason": "interview not found"}, status=status.HTTP_404_NOT_FOUND)
        if interview.expires_at and interview.expires_at < timezone.now():
            logger.info(
                "Magic login interview expired",
                extra={
                    "remote_addr": request.META.get("REMOTE_ADDR"),
                    "applicant_id": applicant_id,
                    "interview_id": interview.id,
                    "http_status": status.HTTP_410_GONE,
                },
            )
            return Response({"valid": False, "reason": "expired"}, status=status.HTTP_410_GONE)
        if interview.status in {"submitted", "completed"}:
            logger.info(
                "Magic login interview already submitted",
                extra={
                    "remote_addr": request.META.get("REMOTE_ADDR"),
                    "applicant_id": applicant_id,
                    "interview_id": interview.id,
                    "status": interview.status,
                    "http_status": status.HTTP_409_CONFLICT,
                },
            )
            return Response({"valid": False, "reason": "already_submitted"}, status=status.HTTP_409_CONFLICT)
        if interview.status not in {"pending", "in_progress"}:
            logger.info(
                "Magic login interview unavailable",
                extra={
                    "remote_addr": request.META.get("REMOTE_ADDR"),
                    "applicant_id": applicant_id,
                    "interview_id": interview.id,
                    "status": interview.status,
                    "http_status": status.HTTP_404_NOT_FOUND,
                },
            )
            return Response({"valid": False, "reason": "interview unavailable"}, status=status.HTTP_404_NOT_FOUND)

        logger.info(
            "Magic login resolved interview",
            extra={
                "remote_addr": request.META.get("REMOTE_ADDR"),
                "applicant_id": applicant_id,
                "interview_id": interview.id,
                "http_status": status.HTTP_200_OK,
            },
        )

        return Response(
            {
                "valid": True,
                "applicant_id": applicant_id,
                "token": token,
                "interview_id": interview.id,
                "redirect_url": f"/interview/{interview.id}/",
            },
            status=status.HTTP_200_OK,
        )


class RefreshApplicantTokenView(APIView):
    """
    Generate a fresh applicant token (for resend).
    """

    authentication_classes = []
    permission_classes = [IsAuthenticated, RolePermission]
    required_user_types = ["HR_MANAGER", "HR_RECRUITER", "IT_SUPPORT", "ADMIN", "SUPERADMIN"]

    def post(self, request):
        applicant_id = request.data.get("applicant_id")
        applicant = Applicant.objects.filter(id=applicant_id).first()
        if not applicant:
            return Response({"error": "Applicant not found"}, status=status.HTTP_404_NOT_FOUND)

        token = generate_applicant_token(applicant.id)
        return Response(
            {
                "token": token,
                "redirect_url": f"/interview-login/{token}/",
            },
            status=status.HTTP_200_OK,
        )


class HRResendInterviewLinkView(APIView):
    """
    HR endpoint to generate and return a fresh magic login URL.
    """

    permission_classes = [IsAuthenticated, RolePermission]
    required_user_types = ["HR_MANAGER", "HR_RECRUITER", "IT_SUPPORT", "ADMIN", "SUPERADMIN"]

    def post(self, request, applicant_id):
        applicant = Applicant.objects.filter(id=applicant_id).first()
        if not applicant:
            return Response({"error": "Applicant not found"}, status=status.HTTP_404_NOT_FOUND)

        interview = Interview.objects.filter(applicant=applicant, archived=False).order_by("-created_at").first()
        if not interview:
            return Response({"error": "Interview not found"}, status=status.HTTP_404_NOT_FOUND)
        if interview.status != "in_progress":
            return Response({"error": "Interview is not in progress."}, status=status.HTTP_400_BAD_REQUEST)

        interview.resumed_count += 1
        interview.last_activity_at = timezone.now()
        interview.save(update_fields=["resumed_count", "last_activity_at"])
        InterviewAuditLog.objects.create(
            interview=interview,
            actor=request.user,
            event_type="resume_resend",
            metadata={"resumed_count": interview.resumed_count},
        )

        token = generate_applicant_token(applicant.id)
        url = f"/interview-login/{token}/"
        return Response({"url": url, "interview_id": interview.id}, status=status.HTTP_200_OK)


class QRLoginView(APIView):
    """
    Validate QR login token (phase2).
    """

    authentication_classes = []
    permission_classes = []
    throttle_classes = [AnonRateThrottle, UserRateThrottle]

    def get(self, request, token):
        try:
            payload = jwt.decode(token, APPLICANT_SECRET, algorithms=["HS256"])
            if payload.get("phase") != "phase2":
                raise jwt.InvalidTokenError("Not a phase2 token")
            applicant_id = payload.get("applicant_id")
            applicant = Applicant.objects.filter(id=applicant_id).first()
            if not applicant:
                raise jwt.InvalidTokenError("Applicant not found")
            if getattr(applicant, "interview_completed", False):
                raise jwt.InvalidTokenError("Interview already completed")
            # validate issued_at matches latest
            issued_at = payload.get("issued_at")
            if applicant.phase2_token_issued_at and issued_at:
                issued_dt = datetime.fromisoformat(issued_at)
                if issued_dt.replace(tzinfo=None) != applicant.phase2_token_issued_at.replace(tzinfo=None):
                    raise jwt.InvalidTokenError("Token superseded")

            return Response({"valid": True, "token": token, "applicant_id": applicant_id}, status=status.HTTP_200_OK)
        except jwt.ExpiredSignatureError:
            return Response({"valid": False, "reason": "expired"}, status=status.HTTP_401_UNAUTHORIZED)
        except jwt.InvalidTokenError as e:
            time.sleep(1)
            return Response({"valid": False, "reason": str(e)}, status=status.HTTP_401_UNAUTHORIZED)


def _generate_qr_base64(data: str):
    if not qrcode:
        return None
    qr = qrcode.QRCode(version=1, box_size=10, border=2)
    qr.add_data(data)
    qr.make(fit=True)
    img = qr.make_image(fill_color="black", back_color="white")
    buffer = io.BytesIO()
    img.save(buffer, format="PNG")
    return base64.b64encode(buffer.getvalue()).decode("utf-8")


class HRGenerateQRView(APIView):
    """
    HR endpoint to generate a phase2 QR login.
    """

    permission_classes = [IsAuthenticated, RolePermission]
    required_user_types = ["HR_MANAGER", "HR_RECRUITER", "IT_SUPPORT", "ADMIN", "SUPERADMIN"]

    def post(self, request, applicant_id):
        applicant = Applicant.objects.filter(id=applicant_id).first()
        if not applicant:
            return Response({"error": "Applicant not found"}, status=status.HTTP_404_NOT_FOUND)

        token = generate_phase2_token(applicant)
        url = f"/qr-login/{token}/"
        qr_image = _generate_qr_base64(url)
        return Response(
            {
                "url": url,
                "qr_image": qr_image,
                "expires_at": (datetime.utcnow() + timedelta(hours=PHASE2_TOKEN_EXPIRY_HOURS)).isoformat(),
            },
            status=status.HTTP_200_OK,
        )


class HRResendQRView(APIView):
    """
    HR endpoint to resend/generate a new QR invite, invalidating previous one.
    """

    permission_classes = [IsAuthenticated, RolePermission]
    required_user_types = ["HR_MANAGER", "HR_RECRUITER", "IT_SUPPORT", "ADMIN", "SUPERADMIN"]

    def post(self, request, applicant_id):
        applicant = Applicant.objects.filter(id=applicant_id).first()
        if not applicant:
            return Response({"error": "Applicant not found"}, status=status.HTTP_404_NOT_FOUND)

        token = generate_phase2_token(applicant)
        url = f"/qr-login/{token}/"
        qr_image = _generate_qr_base64(url)
        return Response(
            {
                "url": url,
                "qr_image": qr_image,
                "expires_at": (datetime.utcnow() + timedelta(hours=PHASE2_TOKEN_EXPIRY_HOURS)).isoformat(),
            },
            status=status.HTTP_200_OK,
        )
