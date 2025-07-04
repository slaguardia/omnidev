'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardBody } from "@heroui/card";
import { Button } from "@heroui/button";
import { Settings, AlertTriangle, CheckCircle } from "lucide-react";

interface ConfigurationStatusProps {
  onNavigateToSettings: () => void;
}

interface ConfigStatus {
  valid: boolean;
  errors: string[];
  message: string;
}

export default function ConfigurationStatus({ onNavigateToSettings }: ConfigurationStatusProps) {
  const [configStatus, setConfigStatus] = useState<ConfigStatus | null>(null);
  const [loading, setLoading] = useState(true);

  const checkConfiguration = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/config/validate');
      const status = await response.json();
      setConfigStatus(status);
    } catch (error) {
      console.error('Failed to check configuration:', error);
      setConfigStatus({
        valid: false,
        errors: ['Failed to check configuration'],
        message: 'Unable to verify configuration status'
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    checkConfiguration();
  }, []);

  if (loading) {
    return (
      <Card className="glass-card">
        <CardBody>
          <div className="flex items-center gap-2">
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary-500"></div>
            <span>Checking configuration...</span>
          </div>
        </CardBody>
      </Card>
    );
  }

  if (!configStatus) {
    return null;
  }

  if (configStatus.valid) {
    return (
      <Card className="glass-card border-success-500/50">
        <CardBody>
          <div className="flex items-center gap-2 text-success-600">
            <CheckCircle className="w-5 h-5" />
            <span className="font-medium">Configuration Complete</span>
          </div>
          <p className="text-sm text-gray-600 mt-1">
            Your GitLab and Claude credentials are configured and ready to use.
          </p>
        </CardBody>
      </Card>
    );
  }

  return (
    <Card className="glass-card border-warning-500/50">
      <CardBody>
        <div className="flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-warning-500 mt-0.5 flex-shrink-0" />
          <div className="flex-1">
            <h3 className="font-medium text-warning-700">Configuration Required</h3>
            <p className="text-sm text-gray-600 mt-1">
              {configStatus.message}
            </p>
            <ul className="text-sm text-gray-600 mt-2 space-y-1">
              {configStatus.errors.map((error, index) => (
                <li key={index} className="flex items-center gap-1">
                  <span className="w-1 h-1 bg-warning-500 rounded-full"></span>
                  {error}
                </li>
              ))}
            </ul>
            <Button
              color="warning"
              variant="flat"
              size="sm"
              startContent={<Settings className="w-4 h-4" />}
              onClick={onNavigateToSettings}
              className="mt-3"
            >
              Open Settings
            </Button>
          </div>
        </div>
      </CardBody>
    </Card>
  );
} 