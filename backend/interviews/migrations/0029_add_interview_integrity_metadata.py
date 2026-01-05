from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("interviews", "0028_interview_retake_expiry_fields"),
    ]

    operations = [
        migrations.AddField(
            model_name="interview",
            name="integrity_metadata",
            field=models.JSONField(
                blank=True,
                default=dict,
                help_text="Advisory integrity signals captured during the interview session",
            ),
        ),
    ]
