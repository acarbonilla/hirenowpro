from django.core.management.base import BaseCommand
from accounts.models import User
from core.roles import normalize_user_type, ROLE_TO_GROUPS
from django.contrib.auth.models import Group


class Command(BaseCommand):
    help = "Synchronizes user.role with Django groups"

    def handle(self, *args, **kwargs):
        for user in User.objects.all():
            canonical_user_type = normalize_user_type(getattr(user, "user_type", None))
            if not canonical_user_type:
                self.stdout.write(f"Skipping {user.username}, missing user_type")
                continue
            legacy_role = canonical_user_type.lower()
            if user.role != legacy_role:
                user.role = legacy_role
                user.save(update_fields=["role"])
            group_names = ROLE_TO_GROUPS.get(canonical_user_type) or []
            group_name = group_names[0] if group_names else None

            if not group_name:
                self.stdout.write(f"Skipping {user.username}, unknown role={canonical_user_type}")
                continue

            group, _ = Group.objects.get_or_create(name=group_name)
            user.groups.clear()
            user.groups.add(group)

            self.stdout.write(f"Updated {user.username}: role={legacy_role} \u2192 group={group_name}")
