from django.core.management.base import BaseCommand

from interviews.models import JobPosition


JOB_POSITIONS = [
    {"name": "Customer Service Representative", "code": "customer_service", "description": "Handles customer inquiries and support."},
    {"name": "Technical Support Specialist", "code": "technical_support", "description": "Provides technical assistance and troubleshooting."},
    {"name": "Sales Associate", "code": "sales_associate", "description": "Generates sales and maintains client relationships."},
    {"name": "HR Recruitment Specialist", "code": "hr_recruitment", "description": "Manages candidate sourcing and hiring."},
    {"name": "Accounting Assistant", "code": "accounting_assistant", "description": "Supports accounting processes and reporting."},
    {"name": "Administrative Assistant", "code": "admin_assistant", "description": "Provides administrative and clerical support."},
    {"name": "Warehouse Staff", "code": "warehouse_staff", "description": "Handles inventory, storage, and logistics tasks."},
    {"name": "IT Helpdesk Technician", "code": "it_helpdesk", "description": "Supports IT-related issues within the company."},
    {"name": "Marketing Coordinator", "code": "marketing_coordinator", "description": "Assists in marketing campaigns and brand management."},
    {"name": "Operations Supervisor", "code": "operations_supervisor", "description": "Oversees day-to-day operational activities."},
]


class Command(BaseCommand):
    help = "Seed default job positions (idempotent)"

    def handle(self, *args, **options):
        created = 0
        updated = 0

        for entry in JOB_POSITIONS:
            obj, was_created = JobPosition.objects.update_or_create(
                code=entry["code"],
                defaults={
                    "name": entry["name"],
                    "description": entry["description"],
                    "is_active": True,
                    "job_category": None,
                },
            )
            if was_created:
                created += 1
                self.stdout.write(self.style.SUCCESS(f"Created: {obj.name}"))
            else:
                updated += 1
                self.stdout.write(self.style.WARNING(f"Updated: {obj.name}"))

        self.stdout.write(self.style.SUCCESS(f"\nDone. Created: {created}, Updated: {updated}"))
