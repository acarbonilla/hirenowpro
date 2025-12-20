from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('interviews', '0020_interviewquestion_competency'),
    ]

    operations = [
        migrations.AddField(
            model_name='positiontype',
            name='description_context',
            field=models.TextField(
                blank=True,
                null=True,
                help_text='Brief context for this job category (scope, typical roles, interview focus)',
            ),
        ),
    ]
