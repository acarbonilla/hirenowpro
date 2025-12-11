from django.contrib import admin
from django.urls import reverse
from django.utils.html import format_html
from django.utils.http import urlencode

from .models import Applicant, ApplicantDocument, OfficeLocation


class ApplicantInline(admin.TabularInline):
    model = Applicant
    fields = ['full_name', 'email', 'status', 'application_date']
    readonly_fields = ['full_name', 'email', 'status', 'application_date']
    can_delete = False
    extra = 0
    show_change_link = True

    def has_add_permission(self, request, obj=None):
        return False


@admin.action(description="Mark as active")
def mark_as_active(modeladmin, request, queryset):
    queryset.update(is_active=True)


@admin.action(description="Mark as inactive")
def mark_as_inactive(modeladmin, request, queryset):
    queryset.update(is_active=False)


@admin.register(OfficeLocation)
class OfficeLocationAdmin(admin.ModelAdmin):
    list_display = ['name', 'address', 'latitude', 'longitude', 'is_active', 'applicant_count']
    search_fields = ['name', 'address']
    list_filter = ['is_active']
    ordering = ['name']
    inlines = [ApplicantInline]
    actions = [mark_as_active, mark_as_inactive]

    def applicant_count(self, obj):
        count = obj.applicants.count()
        url = (
            reverse("admin:applicants_applicant_changelist")
            + "?"
            + urlencode({"office__id__exact": obj.id})
        )
        return format_html('<a href="{}">{}</a>', url, count)

    applicant_count.short_description = "Applicants"


@admin.register(Applicant)
class ApplicantAdmin(admin.ModelAdmin):
    list_display = ['full_name', 'email', 'phone', 'office', 'status', 'application_date']
    search_fields = ['first_name', 'last_name', 'email', 'phone']
    list_filter = ['status', 'office']
    ordering = ['-application_date']
    readonly_fields = ['application_date', 'created_at', 'updated_at']


@admin.register(ApplicantDocument)
class ApplicantDocumentAdmin(admin.ModelAdmin):
    list_display = ['applicant', 'document_type', 'uploaded_at']
    list_filter = ['document_type', 'uploaded_at']
    search_fields = ['applicant__first_name', 'applicant__last_name', 'applicant__email']
