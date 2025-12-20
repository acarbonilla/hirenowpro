from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("interviews", "0016_seed_positiontypes_defaults"),
    ]

    operations = [
        migrations.AddField(
            model_name="interview",
            name="hr_decision",
            field=models.CharField(
                choices=[
                    ("pending", "Pending"),
                    ("hired", "Hired"),
                    ("rejected", "Rejected"),
                    ("on_hold", "On Hold"),
                ],
                default="pending",
                help_text="Final HR decision for the interview",
                max_length=20,
            ),
        ),
        migrations.AddField(
            model_name="interview",
            name="hr_decision_reason",
            field=models.TextField(
                blank=True,
                help_text="Optional HR decision rationale",
                null=True,
            ),
        ),
        migrations.AddField(
            model_name="interview",
            name="hr_decision_at",
            field=models.DateTimeField(
                blank=True,
                help_text="Timestamp when HR recorded the decision",
                null=True,
            ),
        ),
    ]
