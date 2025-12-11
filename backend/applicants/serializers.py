from rest_framework import serializers
from .models import Applicant, ApplicantDocument, OfficeLocation


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


class ApplicantCreateSerializer(serializers.ModelSerializer):
    """Simplified serializer for creating applicants"""
    
    latitude = serializers.DecimalField(max_digits=10, decimal_places=7, required=False, allow_null=True)
    longitude = serializers.DecimalField(max_digits=10, decimal_places=7, required=False, allow_null=True)
    applicant_lat = serializers.FloatField(required=False, allow_null=True, write_only=True)
    applicant_lng = serializers.FloatField(required=False, allow_null=True, write_only=True)
    application_source = serializers.CharField(required=False)
    
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
            'applicant_lng'
        ]
        extra_kwargs = {
            'email': {'validators': []},  # Remove default validators, we'll handle in validate_email
        }
    
    def validate(self, attrs):
        """Ensure application_source has a default value if not provided"""
        if 'application_source' not in attrs or not attrs.get('application_source'):
            attrs['application_source'] = 'online'
        return attrs
    
    def validate_email(self, value):
        """Check if applicant can reapply based on their status and reapplication date"""
        from datetime import date
        
        existing_applicant = Applicant.objects.filter(email=value).first()
        
        if existing_applicant:
            # Statuses that have reapplication waiting periods
            reapplication_statuses = ['failed', 'passed', 'failed_training', 'failed_onboarding']
            
            # If applicant has a status with reapplication waiting period
            if existing_applicant.status in reapplication_statuses and existing_applicant.reapplication_date:
                if date.today() < existing_applicant.reapplication_date:
                    days_remaining = (existing_applicant.reapplication_date - date.today()).days
                    
                    # Different messages for different statuses
                    status_messages = {
                        'failed': 'interview failure',
                        'passed': 'passing the interview',
                        'failed_training': 'training failure',
                        'failed_onboarding': 'onboarding failure'
                    }
                    status_context = status_messages.get(existing_applicant.status, 'previous application')
                    
                    raise serializers.ValidationError(
                        f"You can reapply after {existing_applicant.reapplication_date.strftime('%B %d, %Y')} "
                        f"({days_remaining} days remaining after {status_context}). "
                        f"Please wait until the reapplication period ends."
                    )
                # If reapplication date has passed, allow them to reapply
                # We'll create a new record to keep history
                return value
            
            # If applicant has active status (pending, in_review), don't allow duplicate
            if existing_applicant.status in ['pending', 'in_review']:
                raise serializers.ValidationError(
                    "Your application is currently being processed. Please wait for the result."
                )
            elif existing_applicant.status == 'hired':
                raise serializers.ValidationError(
                    "You are already hired. Please contact HR if you have any questions."
                )
        
        return value
    
    def validate_phone(self, value):
        """Basic phone validation"""
        if not value:
            raise serializers.ValidationError("Phone number is required.")
        return value
    
    def create(self, validated_data):
        """Create or update applicant with geo classification and distance"""
        from datetime import date
        from math import radians, sin, cos, sqrt, atan2
        from decimal import Decimal

        # Normalize incoming lat/lng keys
        applicant_lat = validated_data.pop('applicant_lat', None)
        applicant_lng = validated_data.pop('applicant_lng', None)
        latitude = applicant_lat if applicant_lat is not None else validated_data.get('latitude')
        longitude = applicant_lng if applicant_lng is not None else validated_data.get('longitude')

        # Fetch the default office (first active)
        office = OfficeLocation.objects.filter(is_active=True).first()
        validated_data['office'] = office if office else None

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

        # Default application_source if absent
        if 'application_source' not in validated_data or not validated_data.get('application_source'):
            validated_data['application_source'] = 'walk_in' if geo_status == 'onsite' else 'online'

        email = validated_data['email']
        existing_applicant = Applicant.objects.filter(email=email).first()

        # Statuses that allow reapplication after waiting period
        reapplication_statuses = ['failed', 'passed', 'failed_training', 'failed_onboarding']
        
        # If they're reapplying after a status with waiting period and the period has passed
        if existing_applicant and existing_applicant.status in reapplication_statuses:
            if existing_applicant.reapplication_date and date.today() >= existing_applicant.reapplication_date:
                from django.utils import timezone
                
                # Update existing record for reapplication (preserves history in related tables)
                for key, value in validated_data.items():
                    setattr(existing_applicant, key, value)
                existing_applicant.status = 'pending'
                existing_applicant.reapplication_date = None  # Reset reapplication date
                existing_applicant.application_date = timezone.now()  # Update application date with timezone-aware datetime
                existing_applicant.save()
                return existing_applicant
        
        # Create new applicant
        validated_data['status'] = 'pending'
        return super().create(validated_data)


class ApplicantListSerializer(serializers.ModelSerializer):
    """Lightweight serializer for listing applicants"""
    
    full_name = serializers.ReadOnlyField()
    position_applied = serializers.SerializerMethodField()
    
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
            'position_applied',
            'latitude',
            'longitude',
            'distance_from_office',
            'geo_status'
        ]
    
    def get_position_applied(self, obj):
        """Get position from the applicant's interview if exists"""
        try:
            from interviews.models import Interview
            interview = Interview.objects.filter(applicant=obj).first()
            if interview and interview.position_type:
                return interview.position_type.name
            return None
        except Exception:
            return None
