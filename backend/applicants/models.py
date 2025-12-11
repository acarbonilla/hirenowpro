import math
from decimal import Decimal

from django.db import models


class OfficeLocation(models.Model):
    """Model for company office locations"""

    name = models.CharField(max_length=100)
    address = models.CharField(max_length=255)
    latitude = models.FloatField(null=True, blank=True, help_text="Office latitude in decimal degrees")
    longitude = models.FloatField(null=True, blank=True, help_text="Office longitude in decimal degrees")
    radius_km = models.FloatField(default=10, help_text="Geofence radius in kilometers")
    is_active = models.BooleanField(default=True)

    class Meta:
        db_table = 'office_locations'
        verbose_name = 'Office Location'
        verbose_name_plural = 'Office Locations'

    def __str__(self):
        return self.name


class Applicant(models.Model):
    """Model for job applicants"""
    
    APPLICATION_SOURCE_CHOICES = [
        ('walk_in', 'Walk-in'),
        ('online', 'Online Website'),
    ]
    
    STATUS_CHOICES = [
        ('pending', 'Pending'),
        ('in_review', 'In Review'),
        ('passed', 'Passed - Interview'),
        ('failed', 'Failed - Interview'),
        ('hired', 'Hired'),
        ('failed_training', 'Failed - Training'),
        ('failed_onboarding', 'Failed - Onboarding'),
        ('withdrawn', 'Withdrawn'),
    ]
    
    first_name = models.CharField(max_length=100)
    last_name = models.CharField(max_length=100)
    email = models.EmailField(unique=True)
    phone = models.CharField(max_length=20)
    application_source = models.CharField(max_length=10, choices=APPLICATION_SOURCE_CHOICES)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending')
    application_date = models.DateTimeField(auto_now_add=True)
    reapplication_date = models.DateField(null=True, blank=True, help_text="Date when applicant can reapply")
    
    # Geolocation fields for tracking application location
    latitude = models.DecimalField(max_digits=10, decimal_places=7, null=True, blank=True, help_text="Applicant's latitude during application")
    longitude = models.DecimalField(max_digits=10, decimal_places=7, null=True, blank=True, help_text="Applicant's longitude during application")
    distance_from_office = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True, help_text="Distance in meters from office")
    office = models.ForeignKey('OfficeLocation', on_delete=models.SET_NULL, null=True, blank=True, related_name='applicants')
    geo_status = models.CharField(
        max_length=10,
        choices=[
            ('onsite', 'Onsite'),
            ('offsite', 'Offsite'),
            ('unknown', 'Unknown'),
        ],
        default='unknown',
        help_text="Classification of applicant location relative to office geofence"
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        db_table = 'applicants'
        verbose_name = 'Applicant'
        verbose_name_plural = 'Applicants'
        ordering = ['-application_date']
        indexes = [
            models.Index(fields=['status'], name='idx_applicant_status'),
            models.Index(fields=['application_date'], name='idx_applicant_appdate'),
            models.Index(fields=['email'], name='idx_applicant_email'),
        ]
    
    def __str__(self):
        return f"{self.first_name} {self.last_name} - {self.email}"
    
    @property
    def full_name(self):
        return f"{self.first_name} {self.last_name}"

    @property
    def application_type(self):
        if self.distance_from_office is None:
            return "unknown"
        return "in_office" if self.distance_from_office <= Decimal('30') else "remote"
    
    def save(self, *args, **kwargs):
        """Override save to automatically set reapplication_date for failed and passed statuses"""
        from datetime import date, timedelta
        
        # Statuses that require waiting period before reapplication
        statuses_with_reapplication = ['failed', 'failed_training', 'failed_onboarding', 'passed']
        
        # Check if this is an update (pk exists) and status changed
        if self.pk:
            try:
                old_instance = Applicant.objects.get(pk=self.pk)
                # If status changed to a status that needs reapplication date
                if old_instance.status not in statuses_with_reapplication and self.status in statuses_with_reapplication:
                    # Different waiting periods for different statuses
                    if self.status == 'failed':  # Failed interview - 30 days
                        self.reapplication_date = date.today() + timedelta(days=30)
                    elif self.status == 'passed':  # Passed interview - 6 months (if they don't get hired)
                        self.reapplication_date = date.today() + timedelta(days=180)
                    elif self.status == 'failed_training':  # Failed training - 90 days
                        self.reapplication_date = date.today() + timedelta(days=90)
                    elif self.status == 'failed_onboarding':  # Failed onboarding - 180 days
                        self.reapplication_date = date.today() + timedelta(days=180)
            except Applicant.DoesNotExist:
                pass
        else:
            # New applicant being created with a status that needs reapplication date
            if self.status in statuses_with_reapplication:
                if self.status == 'failed':
                    self.reapplication_date = date.today() + timedelta(days=30)
                elif self.status == 'passed':
                    self.reapplication_date = date.today() + timedelta(days=180)
                elif self.status == 'failed_training':
                    self.reapplication_date = date.today() + timedelta(days=90)
                elif self.status == 'failed_onboarding':
                    self.reapplication_date = date.today() + timedelta(days=180)

        # Compute distance from office if coordinates are available
        if (
            self.office
            and self.latitude is not None
            and self.longitude is not None
            and self.office.latitude is not None
            and self.office.longitude is not None
        ):
            lat1 = math.radians(float(self.latitude))
            lon1 = math.radians(float(self.longitude))
            lat2 = math.radians(float(self.office.latitude))
            lon2 = math.radians(float(self.office.longitude))

            dlat = lat2 - lat1
            dlon = lon2 - lon1

            a = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2) ** 2
            c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
            distance_m = 6371000 * c  # Earth radius in meters

            self.distance_from_office = Decimal(str(round(distance_m, 2)))
            radius_limit_m = float(self.office.radius_km or 0) * 1000
            self.geo_status = 'onsite' if distance_m <= radius_limit_m else 'offsite'
        else:
            self.geo_status = 'unknown'

        super().save(*args, **kwargs)


class ApplicantDocument(models.Model):
    """Model for storing applicant documents"""
    
    DOCUMENT_TYPE_CHOICES = [
        ('resume', 'Resume'),
        ('cover_letter', 'Cover Letter'),
        ('id_document', 'ID Document'),
        ('certificate', 'Certificate'),
        ('other', 'Other'),
    ]
    
    applicant = models.ForeignKey(Applicant, on_delete=models.CASCADE, related_name='documents')
    document_type = models.CharField(max_length=20, choices=DOCUMENT_TYPE_CHOICES)
    file_path = models.FileField(upload_to='applicant_documents/%Y/%m/%d/')
    uploaded_at = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        db_table = 'applicant_documents'
        verbose_name = 'Applicant Document'
        verbose_name_plural = 'Applicant Documents'
        ordering = ['-uploaded_at']
    
    def __str__(self):
        return f"{self.applicant.full_name} - {self.get_document_type_display()}"
