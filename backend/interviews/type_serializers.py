from rest_framework import serializers
from applicants.models import OfficeLocation
from .type_models import PositionType, QuestionType


class OfficeLocationNestedSerializer(serializers.ModelSerializer):
    class Meta:
        model = OfficeLocation
        fields = ['id', 'name', 'address']


class JobCategorySerializer(serializers.ModelSerializer):
    """Serializer for PositionType model"""
    offices = serializers.PrimaryKeyRelatedField(queryset=OfficeLocation.objects.all(), many=True, required=False)
    offices_detail = OfficeLocationNestedSerializer(source='offices', many=True, read_only=True)
    
    class Meta:
        model = PositionType
        fields = [
            'id', 'code', 'name', 'description', 'address', 'employment_type', 'salary',
            'key_responsibilities', 'required_skills', 'qualifications',
            'description_context',
            'is_active', 'order', 'offices', 'offices_detail', 'created_at', 'updated_at'
        ]
        read_only_fields = ['created_at', 'updated_at']
    
    def validate_code(self, value):
        """Ensure code is lowercase and uses underscores"""
        return value.lower().replace(' ', '_').replace('-', '_')


class QuestionTypeSerializer(serializers.ModelSerializer):
    """Serializer for QuestionType model"""
    
    class Meta:
        model = QuestionType
        fields = ['id', 'code', 'name', 'description', 'is_active', 'order', 'created_at', 'updated_at']
        read_only_fields = ['created_at', 'updated_at']
    
    def validate_code(self, value):
        """Ensure code is lowercase and uses underscores"""
        return value.lower().replace(' ', '_').replace('-', '_')
