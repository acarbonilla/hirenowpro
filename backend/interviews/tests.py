from django.test import TestCase
from django.urls import reverse
from rest_framework.test import APITestCase, APIClient
from rest_framework import status
from datetime import timedelta
from django.core.files.uploadedfile import SimpleUploadedFile

from .models import Interview, InterviewQuestion, VideoResponse, AIAnalysis
from applicants.models import Applicant
from .views import select_questions_for_interview


class InterviewQuestionModelTest(TestCase):
    """Test cases for InterviewQuestion model"""
    
    def setUp(self):
        """Set up test data"""
        from .type_models import QuestionType
        self.qtype_general, _ = QuestionType.objects.get_or_create(code="general", defaults={"name": "General"})
        self.qtype_behavioral, _ = QuestionType.objects.get_or_create(code="behavioral", defaults={"name": "Behavioral"})
        self.qtype_situational, _ = QuestionType.objects.get_or_create(code="situational", defaults={"name": "Situational"})
        from .type_models import PositionType
        self.position_type, _ = PositionType.objects.get_or_create(code="test_position", defaults={"name": "Test Position"})
        self.question = InterviewQuestion.objects.create(
            question_text="Tell me about yourself",
            question_type=self.qtype_general,
            position_type=self.position_type,
            is_active=True,
            order=1
        )
    
    def test_question_ordering(self):
        """Test that questions are ordered correctly"""
        q2 = InterviewQuestion.objects.create(
            question_text="What are your strengths?",
            question_type=self.qtype_behavioral,
            position_type=self.position_type,
            is_active=True,
            order=2
        )
        q3 = InterviewQuestion.objects.create(
            question_text="Describe a challenge",
            question_type=self.qtype_situational,
            position_type=self.position_type,
            is_active=True,
            order=3
        )
        questions = list(InterviewQuestion.objects.all())
        self.assertEqual(questions[0].order, 1)
        self.assertEqual(questions[1].order, 2)
        self.assertEqual(questions[2].order, 3)


class InterviewModelTest(TestCase):
    """Test cases for Interview model"""
    
    def setUp(self):
        """Set up test data"""
        self.applicant = Applicant.objects.create(
            first_name="Test",
            last_name="Applicant",
            email="test@example.com",
            phone="1234567890",
            application_source="online"
        )
        
        self.interview = Interview.objects.create(
            applicant=self.applicant,
            interview_type="initial_ai",
            status="pending"
        )
    
    def test_interview_creation(self):
        """Test that interview is created correctly"""
        self.assertEqual(self.interview.applicant, self.applicant)
        self.assertEqual(self.interview.interview_type, "initial_ai")
        self.assertEqual(self.interview.status, "pending")
        self.assertIsNone(self.interview.completed_at)
    
    def test_interview_str(self):
        """Test string representation"""
        expected = f"{self.applicant.full_name} - Initial AI Interview (pending)"
        self.assertEqual(str(self.interview), expected)
    
    def test_interview_status_transitions(self):
        """Test interview status transitions"""
        # pending -> in_progress
        self.interview.status = "in_progress"
        self.interview.save()
        self.assertEqual(self.interview.status, "in_progress")
        
        # in_progress -> completed
        self.interview.status = "completed"
        self.interview.save()
        self.assertEqual(self.interview.status, "completed")


class InterviewAPITest(APITestCase):
    """Test cases for Interview API endpoints"""
    
    def setUp(self):
        """Set up test client and data"""
        self.client = APIClient()
        self.interviews_url = reverse('interview-list')
        self.questions_url = reverse('question-list')
        
        # Create question types
        from .type_models import QuestionType
        self.qtype_general, _ = QuestionType.objects.get_or_create(code="general", defaults={"name": "General"})
        self.qtype_behavioral, _ = QuestionType.objects.get_or_create(code="behavioral", defaults={"name": "Behavioral"})
        self.qtype_technical, _ = QuestionType.objects.get_or_create(code="technical", defaults={"name": "Technical"})

        from .type_models import PositionType
        self.position_type, _ = PositionType.objects.get_or_create(code="test_position", defaults={"name": "Test Position"})
        # Create applicant
        self.applicant = Applicant.objects.create(
            first_name="John",
            last_name="Interview",
            email="john.interview@example.com",
            phone="5551234567",
            application_source="online",
            status="pending"
        )
        self.question1 = InterviewQuestion.objects.create(
            question_text="Tell me about yourself",
            question_type=self.qtype_general,
            position_type=self.position_type,
            is_active=True,
            order=1
        )
        self.question2 = InterviewQuestion.objects.create(
            question_text="What are your strengths?",
            question_type=self.qtype_behavioral,
            position_type=self.position_type,
            is_active=True,
            order=2
        )
        self.question3 = InterviewQuestion.objects.create(
            question_text="Describe a technical challenge",
            question_type=self.qtype_technical,
            position_type=self.position_type,
            is_active=True,
            order=3
        )
        # Inactive question (should not appear)
        self.inactive_question = InterviewQuestion.objects.create(
            question_text="Inactive question",
            question_type=self.qtype_general,
            position_type=self.position_type,
            is_active=False,
            order=4
        )
    
    def test_get_active_questions(self):
        """Test GET /api/questions/ - Get all active questions"""
        response = self.client.get(self.questions_url)
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        # Response might be paginated or a list
        data = response.data if isinstance(response.data, list) else response.data.get('results', [])
        # Filter only active questions (exclude the inactive one)
        active_questions = [q for q in data if q.get('id') != self.inactive_question.id]
        self.assertEqual(len(active_questions), 3)  # Only active questions
        
        # Verify ordering
        self.assertEqual(active_questions[0]['order'], 1)
        self.assertEqual(active_questions[1]['order'], 2)
        self.assertEqual(active_questions[2]['order'], 3)
    
    def test_get_single_question(self):
        """Test GET /api/questions/{id}/ - Get question details"""
        url = reverse('question-detail', args=[self.question1.id])
        response = self.client.get(url)
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['question_text'], "Tell me about yourself")
        # question_type may be an ID, so check the name via lookup
        from .type_models import QuestionType
        qtype = QuestionType.objects.get(id=response.data['question_type'])
        self.assertEqual(qtype.code, "general")
    
    def test_create_interview_success(self):
        """Test POST /api/interviews/ - Create new interview"""
        interview_data = {
            'applicant_id': self.applicant.id,
            'interview_type': 'initial_ai'
        }
        
        response = self.client.post(
            self.interviews_url,
            interview_data,
            format='json'
        )
        
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
    
    def test_create_interview_invalid_applicant(self):
        """Test POST /api/interviews/ - Fail with invalid applicant_id"""
        interview_data = {
            'applicant_id': 99999,  # Non-existent
            'interview_type': 'initial_ai'
        }
        
        response = self.client.post(
            self.interviews_url,
            interview_data,
            format='json'
        )
        
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
    
    def test_list_interviews(self):
        """Test GET /api/interviews/ - List all interviews"""
        # Create some interviews
        Interview.objects.create(
            applicant=self.applicant,
            interview_type="initial_ai"
        )
        
        response = self.client.get(self.interviews_url)
        
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
    
    def test_retrieve_interview(self):
        """Test GET /api/interviews/{id}/ - Get interview details"""
        interview = Interview.objects.create(
            applicant=self.applicant,
            interview_type="initial_ai"
        )
        
        url = reverse('interview-detail', args=[interview.id])
        response = self.client.get(url)
        
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)


class VideoResponseAPITest(APITestCase):
    """Test cases for Video Response upload functionality"""
    
    def setUp(self):
        """Set up test client and data"""
        self.client = APIClient()
        
        # Create applicant
        self.applicant = Applicant.objects.create(
            first_name="Video",
            last_name="Test",
            email="video@example.com",
            phone="5559876543",
            application_source="online"
        )
        
        # Create interview
        self.interview = Interview.objects.create(
            applicant=self.applicant,
            interview_type="initial_ai",
            status="pending"
        )
        
        # Create question type
        from .type_models import QuestionType
        self.qtype_general, _ = QuestionType.objects.get_or_create(code="general", defaults={"name": "General"})
        from .type_models import PositionType
        self.position_type, _ = PositionType.objects.get_or_create(code="test_position", defaults={"name": "Test Position"})
        self.question = InterviewQuestion.objects.create(
            question_text="Test question",
            question_type=self.qtype_general,
            position_type=self.position_type,
            is_active=True,
            order=1
        )
    
    def test_upload_video_response_success(self):
        """Test POST /api/interviews/{id}/video-response/ - Upload video"""
        url = reverse('interview-video-response', args=[self.interview.id])
        
        # Create a mock video file
        video_file = SimpleUploadedFile(
            "test_video.mp4",
            b"fake video content",
            content_type="video/mp4"
        )
        
        video_data = {
            'question_id': self.question.id,
            'video_file_path': video_file,
            'duration': str(timedelta(seconds=30))  # 30 seconds
        }
        
        response = self.client.post(url, video_data, format='multipart')
        
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
    
    def test_upload_video_response_invalid_question(self):
        """Test POST /api/interviews/{id}/video-response/ - Fail with invalid question"""
        url = reverse('interview-video-response', args=[self.interview.id])
        
        video_data = {
            'question_id': 99999,  # Non-existent
            'video_file_path': SimpleUploadedFile("test.mp4", b"content"),
            'duration': str(timedelta(seconds=30))
        }
        
        response = self.client.post(url, video_data, format='multipart')
        
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)


class InterviewSubmissionTest(APITestCase):
    """Test cases for Interview submission and validation"""
    
    def setUp(self):
        """Set up test data"""
        self.client = APIClient()
        
        # Create applicant
        self.applicant = Applicant.objects.create(
            first_name="Submit",
            last_name="Test",
            email="submit@example.com",
            phone="5551112222",
            application_source="online"
        )
        
        # Create interview
        self.interview = Interview.objects.create(
            applicant=self.applicant,
            interview_type="initial_ai",
            status="in_progress"
        )
        
        # Create question type
        from .type_models import QuestionType
        self.qtype_general, _ = QuestionType.objects.get_or_create(code="general", defaults={"name": "General"})
        from .type_models import PositionType
        self.position_type, _ = PositionType.objects.get_or_create(code="test_position", defaults={"name": "Test Position"})
        self.questions = []
        for i in range(1, 4):
            q = InterviewQuestion.objects.create(
                question_text=f"Question {i}",
                question_type=self.qtype_general,
                position_type=self.position_type,
                is_active=True,
                order=i
            )
            self.questions.append(q)
    
    def test_submit_interview_all_answered(self):
        """Test POST /api/interviews/{id}/submit/ - Submit with all answers"""
        # Upload videos for all questions
        for question in self.questions:
            VideoResponse.objects.create(
                interview=self.interview,
                question=question,
                video_file_path="videos/test.mp4",
                duration=timedelta(seconds=30)
            )
        
        url = reverse('interview-submit', args=[self.interview.id])
        response = self.client.post(url)
        
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
    
    def test_submit_interview_missing_answers(self):
        """Test POST /api/interviews/{id}/submit/ - Fail with missing answers"""
        # Upload video for only 1 question (missing 2)
        VideoResponse.objects.create(
            interview=self.interview,
            question=self.questions[0],
            video_file_path="videos/test.mp4",
            duration=timedelta(seconds=30)
        )
        
        url = reverse('interview-submit', args=[self.interview.id])
        response = self.client.post(url)
        
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)


class AIAnalysisModelTest(TestCase):
    """Test cases for AIAnalysis model"""
    
    def setUp(self):
        """Set up test data"""
        self.applicant = Applicant.objects.create(
            first_name="AI",
            last_name="Test",
            email="ai@example.com",
            phone="5553334444",
            application_source="online"
        )
        
        self.interview = Interview.objects.create(
            applicant=self.applicant,
            interview_type="initial_ai"
        )
        
        from .type_models import QuestionType
        self.qtype_general, _ = QuestionType.objects.get_or_create(code="general", defaults={"name": "General"})
        from .type_models import PositionType
        self.position_type, _ = PositionType.objects.get_or_create(code="test_position", defaults={"name": "Test Position"})
        self.question = InterviewQuestion.objects.create(
            question_text="Test question",
            question_type=self.qtype_general,
            position_type=self.position_type,
            order=1
        )
        
        self.video_response = VideoResponse.objects.create(
            interview=self.interview,
            question=self.question,
            video_file_path="videos/test.mp4",
            duration=timedelta(seconds=45)
        )
    
    def test_create_ai_analysis(self):
        """Test creating AI analysis"""
        analysis = AIAnalysis.objects.create(
            video_response=self.video_response,
            transcript_text="This is the transcribed text",
            sentiment_score=85.5,
            confidence_score=90.0,
            body_language_analysis={"eye_contact": "good", "posture": "excellent"},
            speech_clarity_score=88.0,
            content_relevance_score=92.0,
            overall_score=88.9,
            recommendation="pass"
        )
        
        self.assertEqual(analysis.video_response, self.video_response)
        self.assertEqual(analysis.sentiment_score, 85.5)
        self.assertEqual(analysis.overall_score, 88.9)
        self.assertEqual(analysis.recommendation, "pass")
    
    def test_analysis_pass_threshold(self):
        """Test that score >= 70 gets pass recommendation"""
        analysis = AIAnalysis.objects.create(
            video_response=self.video_response,
            transcript_text="Good response",
            sentiment_score=75.0,
            confidence_score=75.0,
            speech_clarity_score=75.0,
            content_relevance_score=75.0,
            overall_score=75.0,
            recommendation="pass"
        )
        
        self.assertGreaterEqual(analysis.overall_score, 70.0)
        self.assertEqual(analysis.recommendation, "pass")
    
    def test_analysis_fail_threshold(self):
        """Test that score < 70 gets fail recommendation"""
        analysis = AIAnalysis.objects.create(
            video_response=self.video_response,
            transcript_text="Poor response",
            sentiment_score=50.0,
            confidence_score=55.0,
            speech_clarity_score=60.0,
            content_relevance_score=55.0,
            overall_score=55.0,
            recommendation="fail"
        )
        
        self.assertLess(analysis.overall_score, 70.0)
        self.assertEqual(analysis.recommendation, "fail")
    
    def test_analysis_str(self):
        """Test string representation"""
        analysis = AIAnalysis.objects.create(
            video_response=self.video_response,
            transcript_text="Test",
            overall_score=88.5,
            recommendation="pass"
        )
        
        expected = f"Analysis: {self.applicant.full_name} - Score: 88.5"
        self.assertEqual(str(analysis), expected)


class InterviewAnalysisAPITest(APITestCase):
    """Test cases for Interview Analysis endpoint"""
    
    def setUp(self):
        """Set up test data"""
        self.client = APIClient()
        
        # Create applicant
        self.applicant = Applicant.objects.create(
            first_name="Analysis",
            last_name="Test",
            email="analysis@example.com",
            phone="5556667777",
            application_source="online"
        )
        
        # Create interview
        self.interview = Interview.objects.create(
            applicant=self.applicant,
            interview_type="initial_ai",
            status="completed"
        )
        
        # Create questions and responses with analysis
        self.create_responses_with_analysis()
    
    def create_responses_with_analysis(self):
        """Helper to create video responses with AI analysis"""
        from .type_models import QuestionType
        self.qtype_general, _ = QuestionType.objects.get_or_create(code="general", defaults={"name": "General"})
        from .type_models import PositionType
        self.position_type, _ = PositionType.objects.get_or_create(code="test_position", defaults={"name": "Test Position"})
        for i in range(1, 4):
            question = InterviewQuestion.objects.create(
                question_text=f"Question {i}",
                question_type=self.qtype_general,
                position_type=self.position_type,
                order=i
            )
            video_response = VideoResponse.objects.create(
                interview=self.interview,
                question=question,
                video_file_path=f"videos/response_{i}.mp4",
                duration=timedelta(seconds=45),
                processed=True
            )
            AIAnalysis.objects.create(
                video_response=video_response,
                transcript_text=f"Response {i} transcript",
                sentiment_score=80.0 + i,
                confidence_score=85.0 + i,
                speech_clarity_score=82.0 + i,
                content_relevance_score=88.0 + i,
                overall_score=84.0 + i,
                recommendation="pass"
            )
    
    def test_get_interview_analysis(self):
        """Test GET /api/interviews/{id}/analysis/ - Get aggregated analysis"""
        url = reverse('interview-analysis', args=[self.interview.id])
        response = self.client.get(url)
        
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)


class InterviewQuestionSelectionTest(TestCase):
    """Ensure questions are locked to position (no cross-subcategory leakage)."""

    def setUp(self):
        from .type_models import QuestionType, PositionType
        self.qtype_general, _ = QuestionType.objects.get_or_create(code="general", defaults={"name": "General"})
        self.position_network, _ = PositionType.objects.get_or_create(code="network_engineer", defaults={"name": "Network Engineer"})
        self.position_helpdesk, _ = PositionType.objects.get_or_create(code="helpdesk", defaults={"name": "Helpdesk"})

        self.network_q1 = InterviewQuestion.objects.create(
            question_text="Network Q1",
            question_type=self.qtype_general,
            position_type=self.position_network,
            is_active=True,
            order=1,
        )
        self.helpdesk_q1 = InterviewQuestion.objects.create(
            question_text="Helpdesk Q1",
            question_type=self.qtype_general,
            position_type=self.position_helpdesk,
            is_active=True,
            order=1,
        )

        self.applicant = Applicant.objects.create(
            first_name="Net",
            last_name="Applicant",
            email="net@applicant.com",
            phone="1231231234",
            application_source="online",
        )

    def test_position_locked_questions(self):
        interview = Interview.objects.create(
            applicant=self.applicant,
            interview_type="initial_ai",
            status="pending",
            position_type=self.position_network,
        )
        qs = select_questions_for_interview(interview)
        ids = {q.id for q in qs}
        self.assertIn(self.network_q1.id, ids)
        self.assertNotIn(self.helpdesk_q1.id, ids)

    def test_active_questions_property_respects_position(self):
        interview = Interview.objects.create(
            applicant=self.applicant,
            interview_type="initial_ai",
            status="pending",
            position_type=self.position_helpdesk,
        )
        active = interview.active_questions
        self.assertEqual(len(active), 1)
        self.assertEqual(active[0].id, self.helpdesk_q1.id)


class VideoResponseValidationTest(APITestCase):
    """Ensure video uploads reject cross-position questions."""

    def setUp(self):
        from accounts.models import User
        from .type_models import QuestionType, PositionType

        self.client = APIClient()
        self.user = User.objects.create_user(username="hr", password="pass", is_superuser=True)
        self.client.force_authenticate(user=self.user)

        self.qtype_general, _ = QuestionType.objects.get_or_create(code="general", defaults={"name": "General"})
        self.position_network, _ = PositionType.objects.get_or_create(code="network_engineer", defaults={"name": "Network Engineer"})
        self.position_helpdesk, _ = PositionType.objects.get_or_create(code="helpdesk", defaults={"name": "Helpdesk"})

        self.applicant = Applicant.objects.create(
            first_name="Upload",
            last_name="Test",
            email="upload@test.com",
            phone="9998887777",
            application_source="online",
        )
        self.interview = Interview.objects.create(
            applicant=self.applicant,
            interview_type="initial_ai",
            status="pending",
            position_type=self.position_network,
        )

        self.helpdesk_question = InterviewQuestion.objects.create(
            question_text="Helpdesk only",
            question_type=self.qtype_general,
            position_type=self.position_helpdesk,
            is_active=True,
            order=1,
        )

    def test_reject_mismatched_question_upload(self):
        url = reverse('interview-video-response', args=[self.interview.id])
        video_data = {
            "question_id": self.helpdesk_question.id,
            "video_file_path": SimpleUploadedFile("vid.mp4", b"fake", content_type="video/mp4"),
            "duration": str(timedelta(seconds=30)),
        }
        response = self.client.post(url, video_data, format="multipart")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("Invalid question for this position", str(response.data))


class HRResendQRPermissionTest(APITestCase):
    def setUp(self):
        from accounts.models import User

        self.client = APIClient()
        self.applicant = Applicant.objects.create(
            first_name="QR",
            last_name="Applicant",
            email="qr@applicant.com",
            phone="5550001111",
            application_source="online",
        )
        self.hr_user = User.objects.create_user(
            username="hr_user",
            password="pass",
            email="hr_user@example.com",
            role="hr",
        )
        self.non_hr_user = User.objects.create_user(
            username="basic_user",
            password="pass",
            email="basic_user@example.com",
            role="applicant",
        )
        self.url = reverse("hr-resend-qr", args=[self.applicant.id])

    def test_hr_user_can_resend_qr(self):
        self.client.force_authenticate(user=self.hr_user)
        response = self.client.post(self.url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_non_hr_user_forbidden(self):
        self.client.force_authenticate(user=self.non_hr_user)
        response = self.client.post(self.url)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_anonymous_unauthorized(self):
        response = self.client.post(self.url)
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
