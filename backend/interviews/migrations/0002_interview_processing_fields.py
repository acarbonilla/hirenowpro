from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("interviews", "0001_initial"),
    ]

    operations = [
        migrations.AddField(
            model_name="interview",
            name="processing_error",
            field=models.TextField(
                blank=True,
                help_text="Processing error details for async interview processing",
                null=True,
            ),
        ),
        migrations.AddField(
            model_name="interview",
            name="processing_finished_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="interview",
            name="processing_started_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="interview",
            name="processing_status",
            field=models.CharField(
                choices=[
                    ("IDLE", "Idle"),
                    ("QUEUED", "Queued"),
                    ("RUNNING", "Running"),
                    ("SUCCEEDED", "Succeeded"),
                    ("FAILED", "Failed"),
                ],
                default="IDLE",
                help_text="Async processing lifecycle state for interview analysis",
                max_length=20,
            ),
        ),
        migrations.AddField(
            model_name="interview",
            name="processing_task_id",
            field=models.CharField(
                blank=True,
                help_text="Celery task ID for async interview processing",
                max_length=255,
                null=True,
            ),
        ),
    ]
