import React, { useState, useEffect } from "react";
import * as SDK from "azure-devops-extension-sdk";
import { Page as PageBase } from "azure-devops-ui/Components/Page/Page";
const Page = PageBase as React.ComponentType<React.ComponentProps<typeof PageBase> & { children?: React.ReactNode }>;
import { Header } from "azure-devops-ui/Components/Header/Header";
import { TitleSize } from "azure-devops-ui/Components/Header/Header.Props";
import { Spinner } from "azure-devops-ui/Components/Spinner/Spinner";
import { SpinnerSize } from "azure-devops-ui/Components/Spinner/Spinner.Props";
import { MessageCard } from "azure-devops-ui/Components/MessageCard/MessageCard";
import { MessageCardSeverity } from "azure-devops-ui/Components/MessageCard/MessageCard.Props";
import { Tab as TabBase } from "azure-devops-ui/Components/Tabs/Tab";
import { TabBar as TabBarBase } from "azure-devops-ui/Components/Tabs/TabBar";
import { checkCollectionAdminPermission } from "../../services/permissionService";
import { ProjectRestrictionTab } from "./components/ProjectRestrictionTab";
import { TemplateCategoriesTab } from "./components/TemplateCategoriesTab";
import { AuditTab } from "./components/AuditTab";

const Tab = TabBase as React.ComponentType<React.ComponentProps<typeof TabBase> & { children?: React.ReactNode }>;
const TabBar = TabBarBase as React.ComponentType<
  React.ComponentProps<typeof TabBarBase> & { children?: React.ReactNode }
>;

export function AdminSettingsApp() {
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [selectedTabId, setSelectedTabId] = useState("restriction");

  useEffect(() => {
    async function init() {
      await SDK.ready();
      const admin = await checkCollectionAdminPermission();
      setIsAdmin(admin);
      setLoading(false);
    }
    void init();
  }, []);

  if (loading) {
    return (
      <Page>
        <div className="page-content page-content-top flex-grow flex-row justify-center">
          <Spinner size={SpinnerSize.large} label="Loading…" />
        </div>
      </Page>
    );
  }

  return (
    <Page>
      <Header title="Project Scaffolding" titleSize={TitleSize.Large} />
      <div className="page-content page-content-top rhythm-vertical-16">
        {!isAdmin && (
          <MessageCard severity={MessageCardSeverity.Warning}>
            You must be a collection administrator to manage Project Scaffolding settings.
          </MessageCard>
        )}

        {isAdmin && (
          <>
            <TabBar onSelectedTabChanged={setSelectedTabId} selectedTabId={selectedTabId}>
              <Tab id="restriction" name="Template Source" />
              <Tab id="categories" name="Categories" />
              <Tab id="audit" name="Audit" />
            </TabBar>
            {selectedTabId === "restriction" && <ProjectRestrictionTab />}
            {selectedTabId === "categories" && <TemplateCategoriesTab />}
            {selectedTabId === "audit" && <AuditTab />}
          </>
        )}
      </div>
    </Page>
  );
}
