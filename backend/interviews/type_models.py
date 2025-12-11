from django.db import models

from applicants.models import OfficeLocation


class PositionType(models.Model):
    """Model for managing position types"""
    
    code = models.CharField(
        max_length=50,
        unique=True,
        help_text="Unique code for the position type (e.g., 'virtual_assistant')"
    )
    name = models.CharField(
        max_length=100,
        help_text="Display name for the position type (e.g., 'Virtual Assistant')"
    )
    description = models.TextField(
        blank=True,
        help_text="About the Role / Description of the position type"
    )
    address = models.CharField(
        max_length=255,
        blank=True,
        help_text="Work location or address (optional)"
    )
    employment_type = models.CharField(
        max_length=20,
        choices=[('Full-time', 'Full-time'), ('Part-time', 'Part-time')],
        default='Full-time',
        help_text="Full-time or Part-time"
    )
    salary = models.CharField(
        max_length=50,
        blank=True,
        help_text="Salary range or amount (optional)"
    )
    key_responsibilities = models.TextField(
        blank=True,
        help_text="Key responsibilities for the role (optional)"
    )
    required_skills = models.TextField(
        blank=True,
        help_text="Required skills for the role (optional)"
    )
    qualifications = models.TextField(
        blank=True,
        help_text="Qualifications for the role (optional)"
    )
    is_active = models.BooleanField(
        default=True,
        help_text="Whether this position type is available for selection"
    )
    order = models.IntegerField(
        default=0,
        help_text="Display order in dropdowns"
    )
    offices = models.ManyToManyField(
        OfficeLocation,
        blank=True,
        related_name='position_types',
        help_text="Offices where this position is available"
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        db_table = 'position_types'
        verbose_name = 'Job Category'
        verbose_name_plural = 'Job Categories'
        ordering = ['order', 'name']
    
    def __str__(self):
        return self.name


class QuestionType(models.Model):
    """Model for managing question types"""
    
    code = models.CharField(
        max_length=50,
        unique=True,
        help_text="Unique code for the question type (e.g., 'technical')"
    )
    name = models.CharField(
        max_length=100,
        help_text="Display name for the question type (e.g., 'Technical')"
    )
    description = models.TextField(
        blank=True,
        help_text="Description of the question type"
    )
    is_active = models.BooleanField(
        default=True,
        help_text="Whether this question type is available for selection"
    )
    order = models.IntegerField(
        default=0,
        help_text="Display order in dropdowns"
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        db_table = 'question_types'
        verbose_name = 'Question Type'
        verbose_name_plural = 'Question Types'
        ordering = ['order', 'name']
    
    def __str__(self):
        return self.name
