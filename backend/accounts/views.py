"""
Authentication views
"""

from rest_framework import status, generics, permissions
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView
from django.contrib.auth import logout
from .models import User
from .serializers import (
    LoginSerializer, 
    UserSerializer, 
    RegisterSerializer,
    ChangePasswordSerializer
)
from .permissions import IsHR, IsApplicant, IsAdmin, IsSuperAdmin


class LoginView(generics.GenericAPIView):
    """
    User login endpoint
    Returns JWT access and refresh tokens
    """
    serializer_class = LoginSerializer
    permission_classes = [AllowAny]
    
    allowed_roles = None  # allow any authenticated user by default
    
    def post(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        
        user = serializer.validated_data['user']

        # Role gate if configured
        normalized_role = getattr(user, "normalized_role", getattr(user, "role", None))
        if self.allowed_roles is not None and normalized_role not in self.allowed_roles:
            return Response({"detail": "Access denied for this role."}, status=status.HTTP_403_FORBIDDEN)
        
        # Generate JWT tokens
        refresh = RefreshToken.for_user(user)
        # Embed useful claims for frontend/permissions
        refresh["role"] = normalized_role
        refresh["is_staff"] = user.is_staff
        refresh["is_superuser"] = user.is_superuser
        refresh["email"] = user.email
        refresh["username"] = user.username
        
        return Response({
            'access': str(refresh.access_token),
            'refresh': str(refresh),
            'user': UserSerializer(user).data,
        }, status=status.HTTP_200_OK)


class LogoutView(generics.GenericAPIView):
    """
    User logout endpoint
    Blacklists the refresh token
    """
    permission_classes = [IsAuthenticated]
    
    def post(self, request):
        try:
            refresh_token = request.data.get('refresh_token')
            
            if refresh_token:
                token = RefreshToken(refresh_token)
                token.blacklist()
            
            logout(request)
            
            return Response({
                'message': 'Logout successful'
            }, status=status.HTTP_200_OK)
            
        except Exception as e:
            return Response({
                'message': 'Logout failed',
                'error': str(e)
            }, status=status.HTTP_400_BAD_REQUEST)


class RegisterView(generics.CreateAPIView):
    """
    User registration endpoint
    """
    queryset = User.objects.all()
    serializer_class = RegisterSerializer
    permission_classes = [AllowAny]
    
    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        
        # Generate JWT tokens
        refresh = RefreshToken.for_user(user)
        refresh["role"] = getattr(user, "normalized_role", getattr(user, "role", None))
        refresh["is_staff"] = user.is_staff
        refresh["is_superuser"] = user.is_superuser
        
        return Response({
            'access': str(refresh.access_token),
            'refresh': str(refresh),
            'user': UserSerializer(user).data,
        }, status=status.HTTP_201_CREATED)


class UserProfileView(generics.RetrieveUpdateAPIView):
    """
    Get and update user profile
    """
    serializer_class = UserSerializer
    permission_classes = [IsAuthenticated]
    
    def get_object(self):
        return self.request.user


class ChangePasswordView(generics.UpdateAPIView):
    """
    Change user password
    """
    serializer_class = ChangePasswordSerializer
    permission_classes = [IsAuthenticated]
    
    def update(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        
        user = request.user
        user.set_password(serializer.validated_data['new_password'])
        user.save()
        
        return Response({
            'message': 'Password changed successfully'
        }, status=status.HTTP_200_OK)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def check_auth(request):
    """
    Check if user is authenticated
    Returns current user data with groups and permissions
    """
    user = request.user
    groups = list(user.groups.values_list('name', flat=True))
    role = getattr(user, "normalized_role", getattr(user, "role", None))
    
    return Response({
        'authenticated': True,
        'user': UserSerializer(user).data,
        'groups': groups,
        'permissions': {
            'is_hr_recruiter': 'HR Recruiter' in groups,
            'is_hr_manager': 'HR Manager' in groups,
            'is_it_support': 'IT Support' in groups,
            'is_staff': user.is_staff,
            'is_superuser': user.is_superuser,
            'role': role,
        }
    }, status=status.HTTP_200_OK)
