from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("interviews", "0030_interview_consent_acknowledged_at"),
    ]

    operations = [
        migrations.AddField(
            model_name="jobposition",
            name="about_role",
            field=models.TextField(blank=True),
        ),
        migrations.AddField(
            model_name="jobposition",
            name="key_responsibilities",
            field=models.JSONField(blank=True, default=list),
        ),
        migrations.AddField(
            model_name="jobposition",
            name="required_skills",
            field=models.JSONField(blank=True, default=list),
        ),
        migrations.AddField(
            model_name="jobposition",
            name="qualifications",
            field=models.JSONField(blank=True, default=list),
        ),
    ]
