
import os
import django
import sys

# Setup Django environment
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'core.settings')
django.setup()

from applicants.models import Applicant
from interviews.models import Interview, InterviewQuestion
from interviews.type_models import PositionType

def run():
    print("Checking data...")
    
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

    # 2. Find a PositionType with Questions
    valid_position = None
    
    all_positions = PositionType.objects.all()
    print(f"Total PositionTypes: {all_positions.count()}")
    
    for pos in all_positions:
        question_count = InterviewQuestion.objects.filter(category=pos, is_active=True).count()
        print(f"Position: {pos.code} (ID: {pos.id}) has {question_count} questions.")
        
        if question_count > 0:
            valid_position = pos
            break
            
    if not valid_position:
        print("No PositionType found with active questions!")
        # Try to fix by finding ANY position and adding a question? 
        # Or finding questions and seeing what category they belong to.
        
        # Let's check if there are ANY questions
        any_question = InterviewQuestion.objects.filter(is_active=True).first()
        if any_question:
            print(f"Found orphan question: {any_question.text} category: {any_question.category}")
            if any_question.category:
                valid_position = any_question.category
        else:
            print("CRITICAL: No active questions in the database at all.")
            return

    if valid_position:
        print(f"Selected Position: {valid_position.code} (ID: {valid_position.id})")
        
        # 3. Create Interview
        interview = Interview.objects.create(
            applicant=applicant,
            position_type=valid_position,
            interview_type="initial_ai",
            status="pending"
        )
        print(f"SUCCESS: Created Interview ID: {interview.id}")
        print(f"URL: http://localhost:3000/interview/{interview.id}")
    else:
        print("FAILED: Could not create interview due to missing data.")

if __name__ == "__main__":
    run()
