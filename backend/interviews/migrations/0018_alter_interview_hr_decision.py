from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("interviews", "0017_interview_hr_decision_fields"),
    ]

    operations = [
        migrations.AlterField(
            model_name="interview",
            name="hr_decision",
            field=models.CharField(
                blank=True,
                choices=[("hire", "Hire"), ("reject", "Reject"), ("hold", "Hold")],
                help_text="Final HR decision for the interview",
                max_length=20,
                null=True,
            ),
        ),
    ]
