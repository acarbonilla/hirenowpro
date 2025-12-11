from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("interviews", "0013_jobposition_category"),
    ]

    operations = [
        migrations.AddField(
            model_name="interviewquestion",
            name="category",
            field=models.ForeignKey(
                blank=True,
                help_text="Job category this question belongs to",
                null=True,
                on_delete=django.db.models.deletion.PROTECT,
                related_name="category_questions",
                to="interviews.positiontype",
            ),
        ),
    ]
