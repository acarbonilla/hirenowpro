from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('accounts', '0001_initial'),
    ]

    operations = [
        migrations.AddField(
            model_name='user',
            name='role',
            field=models.CharField(choices=[('applicant', 'Applicant'), ('hr', 'HR'), ('admin', 'Admin'), ('superadmin', 'Super Admin')], default='applicant', max_length=20),
        ),
    ]

