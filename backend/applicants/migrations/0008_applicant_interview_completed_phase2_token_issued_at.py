from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('applicants', '0007_officelocation_radius_km_applicant_geo_status_and_more'),
    ]

    operations = [
        migrations.AddField(
            model_name='applicant',
            name='interview_completed',
            field=models.BooleanField(default=False, help_text='True when applicant finished interview'),
        ),
        migrations.AddField(
            model_name='applicant',
            name='phase2_token_issued_at',
            field=models.DateTimeField(blank=True, help_text='Timestamp of latest phase2 token', null=True),
        ),
    ]

