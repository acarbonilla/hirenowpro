from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from django.conf import settings
from accounts.authentication import (
    generate_applicant_token,
    generate_phase2_token,
    APPLICANT_SECRET,
    ApplicantTokenAuthentication,
)
from applicants.models import Applicant
import jwt
import time
import logging
from accounts.permissions import RolePermission
import base64
import io

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

    def get(self, request, token):
        try:
            payload = jwt.decode(token, APPLICANT_SECRET, algorithms=["HS256"])
            if payload.get("type") != "applicant":
                raise jwt.InvalidTokenError("Invalid token type")
            applicant_id = payload.get("applicant_id")
            applicant = Applicant.objects.filter(id=applicant_id).first()
            if not applicant:
                raise jwt.InvalidTokenError("Applicant not found")

            logger.info(f"Applicant {applicant_id} accessed magic link from {request.META.get('REMOTE_ADDR')}")

            return Response(
                {
                    "valid": True,
                    "applicant_id": applicant_id,
                    "token": token,
                },
                status=status.HTTP_200_OK,
            )
        except jwt.ExpiredSignatureError:
            return Response({"valid": False, "reason": "expired"}, status=status.HTTP_401_UNAUTHORIZED)
        except jwt.InvalidTokenError as e:
            time.sleep(1)
            return Response({"valid": False, "reason": str(e)}, status=status.HTTP_401_UNAUTHORIZED)


class RefreshApplicantTokenView(APIView):
    """
    Generate a fresh applicant token (for resend).
    """

    authentication_classes = []
    permission_classes = [RolePermission(required_roles=["HR", "ADMIN", "SUPERADMIN"])]

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

    permission_classes = [RolePermission(required_roles=["HR", "ADMIN", "SUPERADMIN"])]

    def post(self, request, applicant_id):
        applicant = Applicant.objects.filter(id=applicant_id).first()
        if not applicant:
            return Response({"error": "Applicant not found"}, status=status.HTTP_404_NOT_FOUND)

        token = generate_applicant_token(applicant.id)
        url = f"/interview-login/{token}/"
        return Response({"url": url}, status=status.HTTP_200_OK)


class QRLoginView(APIView):
    """
    Validate QR login token (phase2).
    """

    authentication_classes = []
    permission_classes = []

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

    permission_classes = [RolePermission(required_roles=["HR", "ADMIN", "SUPERADMIN"])]

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

    permission_classes = [RolePermission(required_roles=["HR", "ADMIN", "SUPERADMIN"])]

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
