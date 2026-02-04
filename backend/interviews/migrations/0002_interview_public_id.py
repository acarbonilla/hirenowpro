from django.db import migrations, models
import uuid


class Migration(migrations.Migration):

    dependencies = [
        ("interviews", "0001_initial"),
    ]

    operations = [
        migrations.AddField(
            model_name="interview",
            name="public_id",
            field=models.UUIDField(
                default=uuid.uuid4,
                unique=True,
                db_index=True,
                editable=False,
                help_text="Public, non-guessable identifier for interview access",
            ),
        ),
    ]
