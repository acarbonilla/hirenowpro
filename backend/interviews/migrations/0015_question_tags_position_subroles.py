from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("interviews", "0014_interviewquestion_category"),
    ]

    operations = [
        migrations.AddField(
            model_name="interviewquestion",
            name="tags",
            field=models.JSONField(blank=True, default=list, help_text="Subroles/tags for specialized question routing"),
        ),
        migrations.AddField(
            model_name="jobposition",
            name="subroles",
            field=models.JSONField(blank=True, default=list, help_text="Subroles determine which specialized questions this job requires."),
        ),
    ]
