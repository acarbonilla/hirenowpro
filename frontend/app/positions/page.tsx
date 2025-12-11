"use client";

import { useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import axios from "axios";
import { Briefcase, MapPin, ArrowRight } from "lucide-react";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api";

interface JobPosition {
  id: number;
  name: string;
  code: string;
  description: string;
  is_active: boolean;
  category_detail?: {
    id: number;
    name: string;
  };
  offices_detail?: {
    id: number;
    name: string;
  }[];
}

// Icon mapping based on position code
const getPositionIcon = (code: string): string => {
  const iconMap: { [key: string]: string } = {
    "virtual-assistant": "✦",
    VA: "✦",
    "customer-service": "☎",
    CS: "☎",
    "data-entry": "⌨",
    DE: "⌨",
    "social-media": "☀",
    IT: "⌘",
  };
  return iconMap[code] || "✦";
};

export default function OpenPositionsPage() {
  const router = useRouter();
  const [positions, setPositions] = useState<JobPosition[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchPositions();
  }, []);

  const fetchPositions = async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/positions/`);
      const data = response.data.results || response.data;
      setPositions(data);
      setLoading(false);
    } catch (error) {
      console.error("Error fetching positions:", error);
      setLoading(false);
    }
  };

  const handleApply = (position: JobPosition) => {
    const offices = position.offices_detail || [];
    if (offices.length === 0) {
      router.push(`/register?position=${position.code}&office=null`);
    } else if (offices.length === 1) {
      router.push(`/register?position=${position.code}&office=${offices[0].id}`);
    } else {
      router.push(`/select-office?position=${position.code}`);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading positions...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex justify-between items-center">
            <div className="flex items-center space-x-3">
              <div className="bg-purple-600 p-2 rounded-lg">
                <svg className="h-8 w-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                  />
                </svg>
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">HireNow Pro</h1>
                <p className="text-sm text-gray-500">Open Positions</p>
              </div>
            </div>
            <div className="flex space-x-3">
              <button
                onClick={() => router.push("/")}
                className="px-4 py-2 text-purple-600 hover:text-purple-700 font-medium"
              >
                Home
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <div className="bg-gradient-to-r from-purple-600 to-indigo-600 text-white py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h1 className="text-4xl md:text-5xl font-bold mb-4">Join Our Team</h1>
          <p className="text-xl text-purple-100 max-w-3xl mx-auto">
            We're hiring talented professionals. Apply now and start your journey with us!
          </p>
        </div>
      </div>

      {/* Positions Grid */}
      <div className="max-w-6xl mx-auto px-4 md:px-6 lg:px-8 py-10 space-y-8">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Available Positions</h2>
          <p className="text-gray-600">{positions.length} open positions • Click "Apply Now" to start your application</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 lg:gap-8">
          {positions.length === 0 ? (
            <div className="col-span-2 text-center py-12">
              <p className="text-gray-600">No positions available at the moment. Please check back later.</p>
            </div>
          ) : (
            positions.map((position) => (
              <div
                key={position.id}
                className="bg-white rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition-all duration-200 overflow-hidden"
              >
                <div className="p-6 space-y-4">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center space-x-3">
                      <div className="text-4xl">{getPositionIcon(position.code)}</div>
                      <div>
                        <h3 className="text-lg font-semibold text-gray-900">{position.name}</h3>
                        {position.category_detail?.name && (
                          <div className="mt-1">
                            <span className="inline-flex items-center px-2 py-1 bg-gray-100 text-gray-700 text-xs font-medium rounded-full">
                              {position.category_detail.name}
                            </span>
                          </div>
                        )}
                        <div className="flex items-center space-x-3 mt-1 text-sm text-gray-600">
                          <span className="inline-flex items-center px-2 py-1 bg-purple-100 text-purple-700 text-xs font-medium rounded-full">
                            <Briefcase className="w-3 h-3 mr-1" />
                            Full-time
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <p className="text-sm text-gray-600 leading-relaxed line-clamp-5 md:line-clamp-none">
                    {position.description || "Join our team!"}
                  </p>

                  <div className="space-y-2">
                    {position.offices_detail && position.offices_detail.length > 0 ? (
                      <div>
                        <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Available Locations</p>
                        <div className="flex flex-wrap gap-2 mt-1">
                          {position.offices_detail.map((office) => (
                            <span
                              key={office.id}
                              className="inline-flex items-center px-3 py-1 text-xs font-medium bg-purple-100 text-purple-800 rounded-full"
                            >
                              <MapPin className="w-3 h-3 mr-1" />
                              {office.name}
                            </span>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-1">
                        <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Available Locations</p>
                        <span className="inline-flex items-center px-3 py-1 text-xs font-medium bg-gray-100 text-gray-600 rounded-full">
                          Remote Only
                        </span>
                      </div>
                    )}
                  </div>

                  <button
                    onClick={() => handleApply(position)}
                    className="w-full md:w-auto px-6 py-2 rounded-lg bg-purple-600 text-white font-medium hover:bg-purple-700 transition inline-flex items-center justify-center space-x-2"
                  >
                    <span>Apply Now</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Benefits Section */}
      <div className="bg-white border-t border-gray-200 py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl font-bold text-gray-900 text-center mb-8">Why Work With Us?</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="text-center p-6">
              <div className="text-4xl mb-3">☁</div>
              <h3 className="font-bold text-gray-900 mb-2">Flexible</h3>
              <p className="text-gray-600">Work where you thrive</p>
            </div>
            <div className="text-center p-6">
              <div className="text-4xl mb-3">⚡</div>
              <h3 className="font-bold text-gray-900 mb-2">Fast Hiring</h3>
              <p className="text-gray-600">Quick AI-powered interview process</p>
            </div>
            <div className="text-center p-6">
              <div className="text-4xl mb-3">💼</div>
              <h3 className="font-bold text-gray-900 mb-2">Competitive Pay</h3>
              <p className="text-gray-600">Fair compensation for your skills</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
