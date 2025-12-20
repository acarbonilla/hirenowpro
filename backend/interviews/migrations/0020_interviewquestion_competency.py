from django.db import migrations, models

import interviews.models


class Migration(migrations.Migration):

    dependencies = [
        ('interviews', '0019_interview_hr_decision_by'),
    ]

    operations = [
        migrations.AddField(
            model_name='interviewquestion',
            name='competency',
            field=models.CharField(
                choices=interviews.models.COMPETENCY_CHOICES,
                default='communication',
                help_text='Competency bucket used for initial interview routing',
                max_length=50,
            ),
        ),
    ]
