from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("results", "0005_interviewresult_applicant_display_name"),
    ]

    operations = [
        migrations.AddField(
            model_name="interviewresult",
            name="hr_decision",
            field=models.CharField(
                blank=True,
                choices=[("hire", "Hire"), ("reject", "Reject"), ("hold", "Hold")],
                help_text="Explicit HR decision for this interview",
                max_length=20,
                null=True,
            ),
        ),
        migrations.AddField(
            model_name="interviewresult",
            name="hr_override_score",
            field=models.IntegerField(
                blank=True,
                help_text="HR override score for overall interview (0-100)",
                null=True,
            ),
        ),
        migrations.AddField(
            model_name="interviewresult",
            name="hr_comment",
            field=models.TextField(
                blank=True,
                help_text="HR comments or rationale for decision/override",
            ),
        ),
        migrations.AddField(
            model_name="interviewresult",
            name="hold_until",
            field=models.DateTimeField(
                blank=True,
                help_text="Optional hold-until date for review follow-up",
                null=True,
            ),
        ),
        migrations.AddField(
            model_name="interviewresult",
            name="hr_decision_at",
            field=models.DateTimeField(
                blank=True,
                help_text="Timestamp when HR recorded the decision",
                null=True,
            ),
        ),
    ]
