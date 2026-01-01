"use client";

import { useRouter } from "next/navigation";
import { Video, Clock, Brain, CheckCircle } from "lucide-react";

export default function HomePage() {
  const router = useRouter();

  const features = [
    {
      icon: <Video className="w-12 h-12 text-blue-500" />,
      title: "Video Interview",
      description: "Record your responses to pre-defined questions at your convenience",
    },
    {
      icon: <Clock className="w-12 h-12 text-green-500" />,
      title: "Flexible Timing",
      description: "Complete the interview at your own pace, on your own schedule",
    },
    {
      icon: <Brain className="w-12 h-12 text-purple-500" />,
      title: "AI Analysis",
      description: "Advanced AI evaluates your responses for comprehensive feedback",
    },
    {
      icon: <CheckCircle className="w-12 h-12 text-orange-500" />,
      title: "Instant Results",
      description: "Get detailed analysis and scores immediately after submission",
    },
  ];

  return (
    <div className="min-h-screen">
      <section className="text-center py-20 px-4">
        <h1 className="text-5xl font-bold mb-6 bg-gradient-to-r from-blue-600 to-purple-600 text-transparent bg-clip-text">
          Welcome to HireNow Pro
        </h1>
        <p className="text-xl text-gray-600 mb-8 max-w-2xl mx-auto">
          Your AI-powered video interview platform. Complete interviews at your convenience and receive instant,
          intelligent feedback.
        </p>
        <div className="flex justify-center gap-4">
          <button
            onClick={() => router.push("/positions")}
            className="bg-blue-600 text-white px-8 py-3 rounded-lg text-lg font-semibold hover:bg-blue-700 transition-colors"
          >
            Get Started
          </button>
        </div>
      </section>

      <section className="py-16 px-4 max-w-6xl mx-auto">
        <h2 className="text-3xl font-bold text-center mb-12">Why Choose HireNow Pro?</h2>
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
          {features.map((feature, index) => (
            <div key={index} className="bg-white p-6 rounded-lg shadow-lg hover:shadow-xl transition-shadow">
              <div className="mb-4">{feature.icon}</div>
              <h3 className="text-xl font-semibold mb-2">{feature.title}</h3>
              <p className="text-gray-600">{feature.description}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="py-16 px-4 bg-gray-50">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-3xl font-bold text-center mb-12">How It Works</h2>
          <div className="space-y-8">
            <div className="flex items-start gap-4">
              <div className="bg-blue-600 text-white w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 font-bold">
                1
              </div>
              <div>
                <h3 className="text-xl font-semibold mb-2">Register</h3>
                <p className="text-gray-600">Create your account with basic information</p>
              </div>
            </div>
            <div className="flex items-start gap-4">
              <div className="bg-blue-600 text-white w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 font-bold">
                2
              </div>
              <div>
                <h3 className="text-xl font-semibold mb-2">Record Responses</h3>
                <p className="text-gray-600">Answer interview questions via video at your own pace</p>
              </div>
            </div>
            <div className="flex items-start gap-4">
              <div className="bg-blue-600 text-white w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 font-bold">
                3
              </div>
              <div>
                <h3 className="text-xl font-semibold mb-2">Submit &amp; Analyze</h3>
                <p className="text-gray-600">Our AI processes your responses and provides detailed feedback</p>
              </div>
            </div>
            <div className="flex items-start gap-4">
              <div className="bg-blue-600 text-white w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 font-bold">
                4
              </div>
              <div>
                <h3 className="text-xl font-semibold mb-2">Get Results</h3>
                <p className="text-gray-600">View your scores and comprehensive analysis instantly</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="py-20 px-4 text-center">
        <h2 className="text-3xl font-bold mb-4">Ready to Get Started?</h2>
        <p className="text-gray-600 mb-8 max-w-2xl mx-auto">
          Join thousands of applicants who have successfully completed their interviews with HireNow Pro
        </p>
        <button
          onClick={() => router.push("/register")}
          className="bg-blue-600 text-white px-8 py-3 rounded-lg text-lg font-semibold hover:bg-blue-700 transition-colors"
        >
          Start Your Interview
        </button>
      </section>
    </div>
  );
}
