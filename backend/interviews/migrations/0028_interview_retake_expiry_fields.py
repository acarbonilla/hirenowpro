from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("interviews", "0027_interview_email_queue_fields"),
    ]

    operations = [
        migrations.AddField(
            model_name="interview",
            name="expires_at",
            field=models.DateTimeField(blank=True, help_text="Expiration timestamp for interview access", null=True),
        ),
        migrations.AddField(
            model_name="interview",
            name="is_retake",
            field=models.BooleanField(
                default=False, help_text="True when interview was created as an HR-approved retake"
            ),
        ),
    ]
