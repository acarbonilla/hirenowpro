from django.conf import settings as django_settings
from django.core.cache import cache
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase
from unittest.mock import patch

from applicants.models import Applicant
from interviews.models import Interview, InterviewQuestion
from interviews.type_models import PositionType
from security.interview_tokens import generate_interview_token


class PublicInterviewFlowTests(APITestCase):
    def setUp(self):
        self.client = self.client_class()
        self.position_type = PositionType.objects.create(code="test-role", name="Test Role")
        from interviews.type_models import QuestionType
        self.qtype_general, _ = QuestionType.objects.get_or_create(code="general", defaults={"name": "General"})
        self.applicant = Applicant.objects.create(
            first_name="Test",
            last_name="User",
            email="test@example.com",
            phone="1234567890",
        )

    def _override_throttle_rates(self, **overrides):
        rates = dict(django_settings.REST_FRAMEWORK.get("DEFAULT_THROTTLE_RATES", {}))
        rates.update(overrides)
        return override_settings(
            REST_FRAMEWORK={
                **django_settings.REST_FRAMEWORK,
                "DEFAULT_THROTTLE_RATES": rates,
            }
        )

    def test_public_interview_resume_requires_token(self):
        interview = Interview.objects.create(
            applicant=self.applicant,
            position_type=self.position_type,
            interview_type="initial_ai",
            status="pending",
        )
        url = "/api/public/interviews/"
        payload = {
            "public_id": str(interview.public_id),
        }
        with override_settings(IS_PROD=True, IS_DEV=False):
            response = self.client.post(url, payload, format="json")
            self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

            token = generate_interview_token(interview.public_id)
            response = self.client.post(
                url,
                payload,
                format="json",
                HTTP_AUTHORIZATION=f"Bearer {token}",
            )
            self.assertEqual(response.status_code, status.HTTP_200_OK)
            self.assertEqual(str(interview.public_id), response.data.get("public_id"))

    def test_public_interview_create_without_public_id(self):
        url = "/api/public/interviews/"
        payload = {
            "applicant_id": self.applicant.id,
            "position_code": self.position_type.code,
            "interview_type": "initial_ai",
        }
        response = self.client.post(url, payload, format="json")
        self.assertIn(response.status_code, [status.HTTP_200_OK, status.HTTP_201_CREATED])
        self.assertIn("public_id", response.data)

    def test_public_interview_resume_allows_missing_token_in_dev(self):
        interview = Interview.objects.create(
            applicant=self.applicant,
            position_type=self.position_type,
            interview_type="initial_ai",
            status="pending",
        )
        url = "/api/public/interviews/"
        payload = {
            "public_id": str(interview.public_id),
        }
        with override_settings(IS_PROD=False, IS_DEV=True):
            response = self.client.post(url, payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(str(interview.public_id), response.data.get("public_id"))

    def test_public_interview_retrieve_returns_200(self):
        interview = Interview.objects.create(
            applicant=self.applicant,
            position_type=self.position_type,
            interview_type="initial_ai",
            status="pending",
        )
        url = f"/api/public/interviews/{interview.public_id}/"
        token = generate_interview_token(interview.public_id)
        response = self.client.get(url, HTTP_AUTHORIZATION=f"Bearer {token}")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("questions", response.data)

    def test_public_interview_video_upload(self):
        interview = Interview.objects.create(
            applicant=self.applicant,
            position_type=self.position_type,
            interview_type="initial_ai",
            status="pending",
        )
        question = InterviewQuestion.objects.create(
            question_text="Sample question",
            order=1,
            is_active=True,
            category=self.position_type,
            position_type=self.position_type,
            question_type=self.qtype_general,
        )
        upload_url = f"/api/public/interviews/{interview.public_id}/video-response/"
        video_file = SimpleUploadedFile("answer.webm", b"dummy-content", content_type="video/webm")
        payload = {
            "question_id": question.id,
            "video_file_path": video_file,
            "duration": "00:00:05",
        }
        token = generate_interview_token(interview.public_id)
        response = self.client.post(
            upload_url,
            payload,
            format="multipart",
            HTTP_AUTHORIZATION=f"Bearer {token}",
        )
        self.assertIn(response.status_code, [status.HTTP_200_OK, status.HTTP_201_CREATED])

    def test_public_interview_upload_allows_five_in_minute(self):
        with self._override_throttle_rates(
            public_interview_upload="100/min",
            public_interview_upload_burst="100/min",
            public_interview_upload_sustained="1000/hour",
        ):
            cache.clear()
            interview = Interview.objects.create(
                applicant=self.applicant,
                position_type=self.position_type,
                interview_type="initial_ai",
                status="pending",
            )
            questions = []
            for i in range(5):
                questions.append(
                    InterviewQuestion.objects.create(
                        question_text=f"Question {i + 1}",
                        order=i + 1,
                        is_active=True,
                        category=self.position_type,
                        position_type=self.position_type,
                        question_type=self.qtype_general,
                    )
                )
            upload_url = f"/api/public/interviews/{interview.public_id}/video-response/"
            token = generate_interview_token(interview.public_id)

            for question in questions:
                video_file = SimpleUploadedFile(
                    f"answer_{question.id}.webm",
                    b"dummy-content",
                    content_type="video/webm",
                )
                payload = {
                    "question_id": question.id,
                    "video_file_path": video_file,
                    "duration": "00:00:05",
                }
                response = self.client.post(
                    upload_url,
                    payload,
                    format="multipart",
                    HTTP_AUTHORIZATION=f"Bearer {token}",
                )
                self.assertIn(response.status_code, [status.HTTP_200_OK, status.HTTP_201_CREATED])

    def test_public_interview_upload_throttle_blocks_spam(self):
        with self._override_throttle_rates(
            public_interview_upload="1000/min",
            public_interview_upload_burst="2/min",
            public_interview_upload_sustained="1000/hour",
        ):
            cache.clear()
            interview = Interview.objects.create(
                applicant=self.applicant,
                position_type=self.position_type,
                interview_type="initial_ai",
                status="pending",
            )
            questions = []
            for i in range(3):
                questions.append(
                    InterviewQuestion.objects.create(
                        question_text=f"Question {i + 1}",
                        order=i + 1,
                        is_active=True,
                        category=self.position_type,
                        position_type=self.position_type,
                        question_type=self.qtype_general,
                    )
                )
            upload_url = f"/api/public/interviews/{interview.public_id}/video-response/"
            token = generate_interview_token(interview.public_id)

            for index, question in enumerate(questions):
                video_file = SimpleUploadedFile(
                    f"spam_{question.id}.webm",
                    b"dummy-content",
                    content_type="video/webm",
                )
                payload = {
                    "question_id": question.id,
                    "video_file_path": video_file,
                    "duration": "00:00:05",
                }
                response = self.client.post(
                    upload_url,
                    payload,
                    format="multipart",
                    HTTP_AUTHORIZATION=f"Bearer {token}",
                )
                if index < 2:
                    self.assertIn(response.status_code, [status.HTTP_200_OK, status.HTTP_201_CREATED])
                else:
                    self.assertEqual(response.status_code, status.HTTP_429_TOO_MANY_REQUESTS)
                    self.assertEqual(response.data.get("code"), "upload_throttled")
                    self.assertIn("detail", response.data)
                    self.assertIn("request_id", response.data)

    def test_public_interview_upload_missing_scope_does_not_500(self):
        rates = dict(django_settings.REST_FRAMEWORK.get("DEFAULT_THROTTLE_RATES", {}))
        rates.pop("public_interview_upload", None)
        rates.pop("public_interview_upload_burst", None)
        rates.pop("public_interview_upload_sustained", None)
        with override_settings(
            REST_FRAMEWORK={
                **django_settings.REST_FRAMEWORK,
                "DEFAULT_THROTTLE_RATES": rates,
            }
        ):
            cache.clear()
            interview = Interview.objects.create(
                applicant=self.applicant,
                position_type=self.position_type,
                interview_type="initial_ai",
                status="pending",
            )
            question = InterviewQuestion.objects.create(
                question_text="Guardrail scope test",
                order=1,
                is_active=True,
                category=self.position_type,
                position_type=self.position_type,
                question_type=self.qtype_general,
            )
            upload_url = f"/api/public/interviews/{interview.public_id}/video-response/"
            token = generate_interview_token(interview.public_id)
            payload = {
                "question_id": question.id,
                "video_file_path": SimpleUploadedFile("guardrail.webm", b"dummy-content", content_type="video/webm"),
                "duration": "00:00:05",
            }

            response = self.client.post(
                upload_url,
                payload,
                format="multipart",
                HTTP_AUTHORIZATION=f"Bearer {token}",
            )
            self.assertNotEqual(response.status_code, status.HTTP_500_INTERNAL_SERVER_ERROR)
            self.assertIn(
                response.status_code,
                [status.HTTP_200_OK, status.HTTP_201_CREATED, status.HTTP_429_TOO_MANY_REQUESTS],
            )

    def test_public_interview_submit_throttle_protects(self):
        with self._override_throttle_rates(public_interview_submit="1/min"):
            cache.clear()
            interview = Interview.objects.create(
                applicant=self.applicant,
                position_type=self.position_type,
                interview_type="initial_ai",
                status="in_progress",
            )
            submit_url = f"/api/public/interviews/{interview.public_id}/submit/"
            token = generate_interview_token(interview.public_id)

            with patch("interviews.public.views.enqueue_interview_processing") as enqueue_mock:
                enqueue_mock.return_value = None
                first = self.client.post(
                    submit_url,
                    {},
                    format="json",
                    HTTP_AUTHORIZATION=f"Bearer {token}",
                )
                self.assertEqual(first.status_code, status.HTTP_202_ACCEPTED)

                second = self.client.post(
                    submit_url,
                    {},
                    format="json",
                    HTTP_AUTHORIZATION=f"Bearer {token}",
                )
                self.assertEqual(second.status_code, status.HTTP_429_TOO_MANY_REQUESTS)

    def test_invalid_interview_id_returns_404(self):
        fake_public_id = "00000000-0000-0000-0000-000000000000"
        url = f"/api/public/interviews/{fake_public_id}/"
        token = generate_interview_token(fake_public_id)
        response = self.client.get(url, HTTP_AUTHORIZATION=f"Bearer {token}")
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
