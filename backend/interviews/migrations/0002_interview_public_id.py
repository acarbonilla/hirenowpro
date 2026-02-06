from django.db import migrations, models
import uuid


def populate_public_ids(apps, schema_editor):
    Interview = apps.get_model("interviews", "Interview")
    db_alias = schema_editor.connection.alias

    null_public_ids = (
        Interview.objects.using(db_alias)
        .filter(public_id__isnull=True)
        .values_list("pk", flat=True)
        .iterator()
    )
    for interview_id in null_public_ids:
        Interview.objects.using(db_alias).filter(pk=interview_id).update(public_id=uuid.uuid4())


def noop_reverse(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ("interviews", "0001_initial"),
    ]

    operations = [
        migrations.AddField(
            model_name="interview",
            name="public_id",
            field=models.UUIDField(
                null=True,
                db_index=True,
                editable=False,
                help_text="Public, non-guessable identifier for interview access",
            ),
        ),
        migrations.RunPython(populate_public_ids, noop_reverse),
        migrations.AlterField(
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
