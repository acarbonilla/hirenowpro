from rest_framework import serializers
from .models import Applicant, ApplicantDocument, OfficeLocation
from .status import get_applicant_status_label


class OfficeLocationSerializer(serializers.ModelSerializer):
    class Meta:
        model = OfficeLocation
        fields = ['id', 'name', 'address', 'latitude', 'longitude', 'radius_km', 'is_active']


class ApplicantDocumentSerializer(serializers.ModelSerializer):
    """Serializer for applicant documents"""
    
    class Meta:
        model = ApplicantDocument
        fields = ['id', 'document_type', 'file_path', 'uploaded_at']
        read_only_fields = ['id', 'uploaded_at']


class ApplicantSerializer(serializers.ModelSerializer):
    """Serializer for applicant model"""
    
    documents = ApplicantDocumentSerializer(many=True, read_only=True)
    full_name = serializers.ReadOnlyField()
    application_type = serializers.ReadOnlyField()
    office = serializers.PrimaryKeyRelatedField(queryset=OfficeLocation.objects.all(), allow_null=True, required=False)
    
    class Meta:
        model = Applicant
        fields = [
            'id', 
            'first_name', 
            'last_name', 
            'full_name',
            'email', 
            'phone', 
            'application_source',
            'status',
            'office',
            'application_date',
            'reapplication_date',
            'latitude',
            'longitude',
            'distance_from_office',
            'geo_status',
            'interview_completed',
            'application_type',
            'documents',
            'created_at',
            'updated_at'
        ]
        read_only_fields = ['id', 'application_date', 'created_at', 'updated_at', 'distance_from_office', 'application_type', 'geo_status', 'interview_completed']
    
    def validate_email(self, value):
        """Ensure email is unique"""
        if self.instance is None:  # Creating new applicant
            if Applicant.objects.filter(email=value).exists():
                raise serializers.ValidationError("An applicant with this email already exists.")
        return value
    
    def validate_phone(self, value):
        """Basic phone validation"""
        if not value:
            raise serializers.ValidationError("Phone number is required.")
        return value

    def validate_latitude(self, value):
        if value is None:
            return value
        return round(value, 6)

    def validate_longitude(self, value):
        if value is None:
            return value
        return round(value, 6)


class ApplicantCreateSerializer(serializers.ModelSerializer):
    """Simplified serializer for creating applicants"""
    
    latitude = serializers.DecimalField(max_digits=10, decimal_places=7, required=False, allow_null=True)
    longitude = serializers.DecimalField(max_digits=10, decimal_places=7, required=False, allow_null=True)
    applicant_lat = serializers.FloatField(required=False, allow_null=True, write_only=True)
    applicant_lng = serializers.FloatField(required=False, allow_null=True, write_only=True)
    application_source = serializers.CharField(required=False)
    is_onsite = serializers.BooleanField(required=False, allow_null=True, write_only=True)
    location_source = serializers.CharField(required=False, allow_null=True, write_only=True)
    position_type_id = serializers.IntegerField(required=False, allow_null=True, write_only=True)
    office_id = serializers.IntegerField(required=False, allow_null=True, write_only=True)
    
    class Meta:
        model = Applicant
        fields = [
            'first_name', 
            'last_name', 
            'email', 
            'phone', 
            'application_source',
            'latitude',
            'longitude',
            'applicant_lat',
            'applicant_lng',
            'is_onsite',
            'location_source',
            'position_type_id',
            'office_id',
        ]
        extra_kwargs = {
            'email': {'validators': []},  # Remove default validators, we'll handle in validate_email
        }
    
    def validate(self, attrs):
        """Ensure application_source has a default value if not provided"""
        office_id = attrs.pop('office_id', None)
        if office_id is not None:
            office = OfficeLocation.objects.filter(pk=office_id).first()
            if not office:
                raise serializers.ValidationError({"office_id": "Invalid office id."})
            attrs['office'] = office
        if 'application_source' not in attrs or not attrs.get('application_source'):
            attrs['application_source'] = 'online'
        return attrs
    
    def validate_email(self, value):
        """Enforce unique applicant emails and prevent re-apply."""

        existing_applicant = Applicant.objects.filter(email=value).first()
        
        if existing_applicant:
            raise serializers.ValidationError(
                "You already have an application. Please check your email for interview instructions."
            )
        
        return value
    
    def validate_phone(self, value):
        """Basic phone validation"""
        if not value:
            raise serializers.ValidationError("Phone number is required.")
        return value
    
    def create(self, validated_data):
        """Create or update applicant with geo classification and distance"""
        from math import radians, sin, cos, sqrt, atan2
        from decimal import Decimal

        # Normalize incoming lat/lng keys
        applicant_lat = validated_data.pop('applicant_lat', None)
        applicant_lng = validated_data.pop('applicant_lng', None)
        validated_data.pop('position_type_id', None)
        latitude = applicant_lat if applicant_lat is not None else validated_data.get('latitude')
        longitude = applicant_lng if applicant_lng is not None else validated_data.get('longitude')

        # Fetch the default office (first active) if not provided
        if 'office' not in validated_data:
            office = OfficeLocation.objects.filter(is_active=True).first()
            validated_data['office'] = office if office else None
        office = validated_data.get('office')

        geo_status = 'unknown'
        distance_m = None

        if office and latitude is not None and longitude is not None and office.latitude is not None and office.longitude is not None:
            R = 6371  # Earth radius in kilometers
            lat1 = radians(float(latitude))
            lon1 = radians(float(longitude))
            lat2 = radians(float(office.latitude))
            lon2 = radians(float(office.longitude))

            dlat = lat2 - lat1
            dlon = lon2 - lon1

            a = sin(dlat / 2) ** 2 + cos(lat1) * cos(lat2) * sin(dlon / 2) ** 2
            c = 2 * atan2(sqrt(a), sqrt(1 - a))
            distance_km = R * c
            distance_m = round(distance_km * 1000, 2)

            radius_km = float(office.radius_km or 0)
            geo_status = 'onsite' if distance_km <= radius_km else 'offsite'

            validated_data['distance_from_office'] = Decimal(str(distance_m))
        elif latitude is None or longitude is None:
            geo_status = 'unknown'

        # Persist applicant coordinates
        validated_data['latitude'] = latitude
        validated_data['longitude'] = longitude
        validated_data['geo_status'] = geo_status
        validated_data.pop('is_onsite', None)
        validated_data.pop('location_source', None)

        # Default application_source if absent
        if 'application_source' not in validated_data or not validated_data.get('application_source'):
            validated_data['application_source'] = 'walk_in' if geo_status == 'onsite' else 'online'

        # Create new applicant
        validated_data['status'] = 'pending'
        return super().create(validated_data)


class ApplicantListSerializer(serializers.ModelSerializer):
    """Lightweight serializer for listing applicants"""
    
    full_name = serializers.ReadOnlyField()
    position_applied = serializers.SerializerMethodField()
    applicant_status = serializers.SerializerMethodField()
    applicant_status_key = serializers.SerializerMethodField()
    needs_hr_action = serializers.SerializerMethodField()
    has_pending_review = serializers.SerializerMethodField()
    days_until_reapply = serializers.SerializerMethodField()
    pending_review_result_id = serializers.SerializerMethodField()
    
    class Meta:
        model = Applicant
        fields = [
            'id',
            'full_name',
            'email',
            'phone',
            'application_source',
            'status',
            'application_date',
            'reapplication_date',
            'days_until_reapply',
            'position_applied',
            'applicant_status',
            'applicant_status_key',
            'needs_hr_action',
            'has_pending_review',
            'pending_review_result_id',
            'latitude',
            'longitude',
            'distance_from_office',
            'geo_status'
        ]
    
    def get_position_applied(self, obj):
        """Get position from the applicant's interview if exists"""
        return getattr(obj, "latest_position_name", None)

    def get_applicant_status_key(self, obj):
        return getattr(obj, "applicant_status_key", None)

    def get_applicant_status(self, obj):
        status_key = getattr(obj, "applicant_status_key", None)
        return get_applicant_status_label(status_key)

    def get_needs_hr_action(self, obj):
        return bool(getattr(obj, "needs_hr_action", False))

    def get_has_pending_review(self, obj):
        return bool(getattr(obj, "has_pending_review", False))

    def get_days_until_reapply(self, obj):
        from django.utils import timezone

        reapply_date = getattr(obj, "reapplication_date", None)
        if not reapply_date:
            return None
        today = timezone.localdate()
        if reapply_date <= today:
            return None
        return (reapply_date - today).days

    def get_pending_review_result_id(self, obj):
        if not bool(getattr(obj, "has_pending_review", False)):
            return None
        return getattr(obj, "latest_result_id", None)
