from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("interviews", "0031_jobposition_structured_details"),
    ]

    operations = [
        migrations.AddField(
            model_name="jobposition",
            name="salary_min",
            field=models.DecimalField(blank=True, decimal_places=2, max_digits=10, null=True),
        ),
        migrations.AddField(
            model_name="jobposition",
            name="salary_max",
            field=models.DecimalField(blank=True, decimal_places=2, max_digits=10, null=True),
        ),
        migrations.AddField(
            model_name="jobposition",
            name="salary_currency",
            field=models.CharField(default="PHP", max_length=10),
        ),
    ]
