from decimal import Decimal

from django.test import TestCase

from applicants.models import Applicant


class ApplicantApplicationTypeTests(TestCase):
    def test_application_type_unknown_when_distance_is_none(self):
        applicant = Applicant(distance_from_office=None)
        self.assertEqual(applicant.application_type, "unknown")

    def test_application_type_in_office_thresholds(self):
        for value in [Decimal("0"), Decimal("10"), Decimal("30")]:
            with self.subTest(distance=value):
                applicant = Applicant(distance_from_office=value)
                self.assertEqual(applicant.application_type, "in_office")

    def test_application_type_remote_above_threshold(self):
        for value in [Decimal("31"), Decimal("100"), Decimal("300")]:
            with self.subTest(distance=value):
                applicant = Applicant(distance_from_office=value)
                self.assertEqual(applicant.application_type, "remote")

    def test_application_type_edge_precision(self):
        applicant = Applicant(distance_from_office=Decimal("30.0000001"))
        self.assertEqual(applicant.application_type, "remote")
