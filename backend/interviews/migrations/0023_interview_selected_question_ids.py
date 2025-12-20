from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("interviews", "0022_alter_interviewquestion_tags_and_more"),
    ]

    operations = [
        migrations.AddField(
            model_name="interview",
            name="selected_question_ids",
            field=models.JSONField(blank=True, default=list, help_text="Ordered list of question IDs selected for this interview"),
        ),
    ]
