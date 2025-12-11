from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("interviews", "0012_jobposition_created_by"),
    ]

    operations = [
        migrations.AddField(
            model_name="jobposition",
            name="category",
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.PROTECT,
                related_name="positions",
                to="interviews.positiontype",
                default=1,
            ),
            preserve_default=False,
        ),
    ]
