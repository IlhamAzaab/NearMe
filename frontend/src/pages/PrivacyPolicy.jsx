import React from "react";
import PageWrapper from "../components/PageWrapper";

export default function PrivacyPolicy() {
  return (
    <PageWrapper>
      <div className="max-w-3xl mx-auto py-12 px-4">
        <h1 className="text-2xl font-bold mb-6">Privacy Policies</h1>

        <ul className="list-disc pl-5 space-y-3">
          <li>
            <a
              href="https://mellow-daifuku-051f2e.netlify.app/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 underline"
            >
              Customer privacy policy
            </a>
          </li>
          <li>
            <a
              href="https://frabjous-douhua-6c3f75.netlify.app/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 underline"
            >
              Driver privacy policy
            </a>
          </li>
          <li>
            <a
              href="https://moonlit-dieffenbachia-52f106.netlify.app/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 underline"
            >
              Admin privacy policy
            </a>
          </li>
        </ul>

        <p className="mt-6 text-gray-700">
          Platform managers may access customer, restaurant, driver, and order
          data for operations, support, fraud prevention, dispute handling,
          settlements, and service management.
        </p>
      </div>
    </PageWrapper>
  );
}
