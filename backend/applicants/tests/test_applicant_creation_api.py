from decimal import Decimal

from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from applicants.models import Applicant, OfficeLocation


class ApplicantCreationAPITests(APITestCase):
    def setUp(self):
        self.office = OfficeLocation.objects.create(
            name="HQ",
            address="123 Main St",
            latitude=Decimal("14.599512"),
            longitude=Decimal("120.984222"),
            is_active=True,
        )
        self.url = reverse("applicant-list")
        self.base_payload = {
            "first_name": "Juan",
            "last_name": "Dela Cruz",
            "email": "juan@example.com",
            "phone": "09171234567",
            "application_source": "online",
            "office": self.office.id,
            "latitude": str(self.office.latitude),
            "longitude": str(self.office.longitude),
        }

    def test_successful_applicant_creation(self):
        response = self.client.post(self.url, self.base_payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertTrue(Applicant.objects.filter(email=self.base_payload["email"]).exists())

        data = response.data.get("applicant", {})
        self.assertIn("id", data)
        self.assertIn("full_name", data)
        self.assertEqual(data.get("office"), self.office.id)
        self.assertIsNotNone(data.get("distance_from_office"))
        self.assertEqual(data.get("application_type"), "in_office")

    def test_missing_required_fields(self):
        required_fields = ["first_name", "email", "phone", "application_source"]
        for field in required_fields:
            with self.subTest(missing=field):
                payload = self.base_payload.copy()
                payload.pop(field, None)
                response = self.client.post(self.url, payload, format="json")
                self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
                self.assertIn(field, response.data.get("details", response.data))

    def test_invalid_office_id(self):
        payload = self.base_payload.copy()
        payload["office"] = 9999
        response = self.client.post(self.url, payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("office", response.data.get("details", response.data))

    def test_creation_without_coordinates(self):
        payload = self.base_payload.copy()
        payload["latitude"] = None
        payload["longitude"] = None
        response = self.client.post(self.url, payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

        data = response.data.get("applicant", {})
        self.assertIsNone(data.get("distance_from_office"))
        self.assertEqual(data.get("application_type"), "unknown")
