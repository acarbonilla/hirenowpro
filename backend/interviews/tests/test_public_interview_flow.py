from django.core.files.uploadedfile import SimpleUploadedFile
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from applicants.models import Applicant
from interviews.models import Interview, InterviewQuestion
from interviews.type_models import PositionType


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

    def test_public_interview_creation_creates_db_record(self):
        url = "/api/public/interviews/"
        payload = {
            "applicant_id": self.applicant.id,
            "position_code": self.position_type.code,
            "interview_type": "initial_ai",
        }
        response = self.client.post(url, payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        interview_id = response.data.get("id") or response.data.get("interview", {}).get("id")
        self.assertIsNotNone(interview_id)
        self.assertTrue(Interview.objects.filter(id=interview_id).exists())

    def test_public_interview_retrieve_returns_200(self):
        interview = Interview.objects.create(
            applicant=self.applicant,
            position_type=self.position_type,
            interview_type="initial_ai",
            status="pending",
        )
        url = f"/api/public/interviews/{interview.id}/"
        response = self.client.get(url)
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
        upload_url = f"/api/public/interviews/{interview.id}/video-response/"
        video_file = SimpleUploadedFile("answer.webm", b"dummy-content", content_type="video/webm")
        payload = {
            "question_id": question.id,
            "video_file_path": video_file,
            "duration": "00:00:05",
        }
        response = self.client.post(upload_url, payload, format="multipart")
        self.assertNotIn(response.status_code, [status.HTTP_401_UNAUTHORIZED, status.HTTP_404_NOT_FOUND])
        self.assertIn(response.status_code, [status.HTTP_200_OK, status.HTTP_201_CREATED])

    def test_invalid_interview_id_returns_404(self):
        url = "/api/public/interviews/999999/"
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
