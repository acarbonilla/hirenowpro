from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("interviews", "0029_add_interview_integrity_metadata"),
    ]

    operations = [
        migrations.AddField(
            model_name="interview",
            name="consent_acknowledged_at",
            field=models.DateTimeField(
                blank=True,
                help_text="Timestamp when the applicant acknowledged the integrity notice",
                null=True,
            ),
        ),
    ]
