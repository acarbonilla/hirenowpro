# Serializers for System Settings

from rest_framework import serializers
from .models import SystemSettings


class SystemSettingsSerializer(serializers.ModelSerializer):
    """Serializer for system settings"""
    
    class Meta:
        model = SystemSettings
        fields = [
            'passing_score_threshold',
            'review_score_threshold',
            'max_concurrent_interviews',
            'interview_expiry_days',
            'enable_script_detection',
            'enable_sentiment_analysis',
            'last_modified',
            'modified_by',
        ]
        read_only_fields = ['last_modified']
    
    def validate(self, data):
        """Validate that passing threshold is greater than review threshold"""
        passing = data.get('passing_score_threshold')
        review = data.get('review_score_threshold')
        
        # If both are being updated, check their relationship
        if passing is not None and review is not None:
            if passing <= review:
                raise serializers.ValidationError({
                    'passing_score_threshold': 'Passing threshold must be greater than review threshold'
                })
        
        return data
