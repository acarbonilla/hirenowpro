from django.db import migrations


def sync_role_with_user_type(apps, schema_editor):
    User = apps.get_model("accounts", "User")
    for user in User.objects.all():
        user_type = getattr(user, "user_type", None)
        if not user_type:
            continue
        if user.role != user_type:
            user.role = user_type
            user.save(update_fields=["role"])


class Migration(migrations.Migration):
    dependencies = [
        ("accounts", "0003_create_default_groups"),
    ]

    operations = [
        migrations.RunPython(sync_role_with_user_type, migrations.RunPython.noop),
    ]
