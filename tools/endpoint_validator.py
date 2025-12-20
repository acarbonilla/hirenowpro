"""
Comprehensive endpoint validator to confirm auth/permission boundaries for public, applicant, and HR APIs.

Usage:
  python tools/endpoint_validator.py --base http://localhost:8000 \
      --applicant-token <token> --hr-token <token> [--position-type-id 1] [--public-interview-id 1]
"""

import argparse
import json
import sys
from typing import Dict, Optional

import requests
from requests import RequestException


class Validator:
    def __init__(self, base: str, applicant_token: Optional[str], hr_token: Optional[str]):
        self.base = base.rstrip("/")
        self.applicant_token = applicant_token
        self.hr_token = hr_token
        self.passed = 0
        self.failed = 0

    def _headers(self, token: Optional[str] = None) -> Dict[str, str]:
        return {"Authorization": f"Bearer {token}"} if token else {}

    def _log(self, ok: bool, url: str, expected: int, actual: int, extra: str = ""):
        verdict = "PASS" if ok else "FAIL"
        print(f"[{verdict}] expect={expected} got={actual} url={url}{extra}")
        if ok:
            self.passed += 1
        else:
            self.failed += 1

    def get(self, path: str, expect: int, token: Optional[str] = None):
        url = f"{self.base}{path}"
        try:
            resp = requests.get(url, headers=self._headers(token), timeout=10)
            self._log(resp.status_code == expect, url, expect, resp.status_code)
            return resp
        except RequestException as exc:
            self._log(False, url, expect, -1, f" error={exc}")
            return None

    def post(self, path: str, data: Dict, expect: int, token: Optional[str] = None):
        url = f"{self.base}{path}"
        try:
            resp = requests.post(url, json=data, headers=self._headers(token), timeout=10)
            self._log(resp.status_code == expect, url, expect, resp.status_code, f" body={resp.text}")
            return resp
        except RequestException as exc:
            self._log(False, url, expect, -1, f" error={exc}")
            return None

    def run_public_tests(self, public_interview_id: Optional[int]):
        print("\n=== Public namespace (no token expected) ===")
        self.get("/api/public/position-types/", expect=200)
        self.get("/api/public/positions/", expect=200)
        if public_interview_id:
            self.get(f"/api/public/interviews/{public_interview_id}/", expect=200)

    def run_applicant_tests(self, position_type_id: Optional[int]):
        print("\n=== Applicant namespace ===")
        if self.applicant_token:
            self.get("/api/applicant/interviews/", expect=200, token=self.applicant_token)
            if position_type_id:
                payload = {
                    "interview_type": "initial_ai",
                    "position_type": position_type_id,
                }
                self.post("/api/applicant/interviews/", payload, expect=201, token=self.applicant_token)
        else:
            print("Skipping applicant-auth tests (no applicant token provided)")

        if self.hr_token:
            self.get("/api/applicant/interviews/", expect=403, token=self.hr_token)
        else:
            print("Skipping HR->applicant cross test (no HR token provided)")

        self.get("/api/applicant/interviews/", expect=401, token=None)

    def run_hr_tests(self):
        print("\n=== HR namespace ===")
        if self.hr_token:
            self.get("/api/hr/positions/", expect=200, token=self.hr_token)
            self.get("/api/hr/interviews/", expect=200, token=self.hr_token)
        else:
            print("Skipping HR-auth tests (no HR token provided)")

        if self.applicant_token:
            self.get("/api/hr/positions/", expect=403, token=self.applicant_token)
        else:
            print("Skipping applicant->HR cross test (no applicant token provided)")

        self.get("/api/hr/positions/", expect=401, token=None)

    def run_auth_check(self):
        print("\n=== /api/auth/check diagnostics ===")
        if self.applicant_token:
            resp = self.get("/api/auth/check/", expect=200, token=self.applicant_token)
            if resp and resp.status_code == 200:
                try:
                    payload = resp.json()
                    user_type = payload.get("user_type") or payload.get("permissions", {}).get("role")
                    print(f"Applicant check user_type={user_type}")
                except Exception:
                    print("Unable to parse applicant auth check response")
        else:
            print("Skipping applicant auth check (no applicant token provided)")

        if self.hr_token:
            resp = self.get("/api/auth/check/", expect=200, token=self.hr_token)
            if resp and resp.status_code == 200:
                try:
                    payload = resp.json()
                    user_type = payload.get("user_type") or payload.get("permissions", {}).get("role")
                    print(f"HR check user_type={user_type}")
                except Exception:
                    print("Unable to parse HR auth check response")
        else:
            print("Skipping HR auth check (no HR token provided)")

    def summarize(self):
        print("\n=== Summary ===")
        print(f"Passed: {self.passed}")
        print(f"Failed: {self.failed}")
        return 0 if self.failed == 0 else 1


def main():
    parser = argparse.ArgumentParser(description="Endpoint validator for auth boundaries.")
    parser.add_argument("--base", default="http://localhost:8000", help="Base URL (default: http://localhost:8000)")
    parser.add_argument("--applicant-token", help="Applicant JWT token")
    parser.add_argument("--hr-token", help="HR JWT token")
    parser.add_argument("--position-type-id", type=int, help="PositionType ID for applicant interview create test")
    parser.add_argument("--public-interview-id", type=int, help="Public interview id to test retrieval")
    args = parser.parse_args()

    v = Validator(args.base, args.applicant_token, args.hr_token)
    v.run_public_tests(args.public_interview_id)
    v.run_applicant_tests(args.position_type_id)
    v.run_hr_tests()
    v.run_auth_check()
    sys.exit(v.summarize())


if __name__ == "__main__":
    main()
