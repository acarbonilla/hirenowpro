from django.db import migrations, models
from django.conf import settings


class Migration(migrations.Migration):

    dependencies = [
        ("interviews", "0018_alter_interview_hr_decision"),
    ]

    operations = [
        migrations.AddField(
            model_name="interview",
            name="hr_decision_by",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=models.SET_NULL,
                related_name="interview_hr_decisions",
                to=settings.AUTH_USER_MODEL,
                help_text="HR user who recorded the decision",
            ),
        ),
    ]
