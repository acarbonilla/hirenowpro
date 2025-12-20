from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("interviews", "0023_interview_selected_question_ids"),
    ]

    operations = [
        migrations.AddField(
            model_name="interview",
            name="selected_question_metadata",
            field=models.JSONField(blank=True, default=list, help_text="Selection metadata per slot (slot competency, selected competency, fallback)"),
        ),
    ]
