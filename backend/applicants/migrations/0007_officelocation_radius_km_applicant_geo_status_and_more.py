from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('applicants', '0006_officelocation_applicant_office'),
    ]

    operations = [
        migrations.AddField(
            model_name='officelocation',
            name='radius_km',
            field=models.FloatField(default=10, help_text='Geofence radius in kilometers'),
        ),
        migrations.AlterField(
            model_name='officelocation',
            name='latitude',
            field=models.FloatField(blank=True, help_text='Office latitude in decimal degrees', null=True),
        ),
        migrations.AlterField(
            model_name='officelocation',
            name='longitude',
            field=models.FloatField(blank=True, help_text='Office longitude in decimal degrees', null=True),
        ),
        migrations.AddField(
            model_name='applicant',
            name='geo_status',
            field=models.CharField(choices=[('onsite', 'Onsite'), ('offsite', 'Offsite'), ('unknown', 'Unknown')], default='unknown', help_text='Classification of applicant location relative to office geofence', max_length=10),
        ),
    ]

