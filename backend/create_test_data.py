
import os
import django
import sys

# Setup Django environment
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'core.settings')
django.setup()

from applicants.models import Applicant
from interviews.models import Interview, InterviewQuestion
from interviews.type_models import PositionType, QuestionType

def run():
    print("Checking/Fixing data...")
    
    # 1. Check Applicants
    applicant = Applicant.objects.first()
    if not applicant:
        print("No applicants found! Creating one...")
        applicant = Applicant.objects.create(
            first_name="Test", 
            last_name="User", 
            email="test@example.com"
        )
    print(f"Using Applicant: {applicant.id} - {applicant.first_name}")

    # 2. Get Target PositionType
    position_code = "virtual_assistant"
    position = PositionType.objects.filter(code=position_code).first()
    if not position:
        print(f"PositionType '{position_code}' not found. Using first available.")
        position = PositionType.objects.first()
        
    if not position:
        print("CRITICAL: No PositionTypes found.")
        return

    print(f"Using Position: {position.code} (ID: {position.id})")

    # 3. Ensure Questions Exist
    question_count = InterviewQuestion.objects.filter(category=position, is_active=True).count()
    print(f"Existing active questions for {position.code}: {question_count}")

    if question_count == 0:
        print("Creating default questions...")
        
        # Ensure QuestionType exists
        q_type, _ = QuestionType.objects.get_or_create(name="Behavioral", defaults={"description": "Behavioral questions"})
        
        questions = [
            "Tell me about yourself and your relevant experience.",
            "Why do you want to work for this company?",
            "Describe a challenging situation you faced at work and how you handled it.",
            "Where do you see yourself in 5 years?",
            "Do you have any questions for us?"
        ]
        
        for i, text in enumerate(questions):
            InterviewQuestion.objects.create(
                question_text=text,
                question_type=q_type,
                category=position,
                position_type=position, # It seems model has both category and position_type, seemingly redundant or specific? Model def shows both.
                order=i,
                is_active=True
            )
        print(f"Created {len(questions)} questions.")
            
    # 4. Create Interview
    interview = Interview.objects.create(
        applicant=applicant,
        position_type=position,
        interview_type="initial_ai",
        status="pending"
    )
    print(f"SUCCESS: Created Interview ID: {interview.id}")
    print(f"URL: http://localhost:3000/interview/{interview.id}")

if __name__ == "__main__":
    run()
