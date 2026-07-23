"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { Slot } from "@/components/ui/slot";

const SIDEBAR_WIDTH = "16rem";
const SIDEBAR_WIDTH_ICON = "3.5rem";
const SIDEBAR_WIDTH_MOBILE = "18rem";

const SidebarContext = React.createContext<{
  open: boolean;
  setOpen: (open: boolean) => void;
  openMobile: boolean;
  setOpenMobile: (open: boolean) => void;
  isMobile: boolean;
  toggleSidebar: () => void;
  state: "expanded" | "collapsed";
} | null>(null);

export function useSidebar() {
  const context = React.useContext(SidebarContext);
  if (!context) throw new Error("useSidebar must be used within SidebarProvider");
  return context;
}

export function SidebarProvider({
  children,
  defaultOpen = true,
}: {
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = React.useState(defaultOpen);
  const [openMobile, setOpenMobile] = React.useState(false);
  const [isMobile, setIsMobile] = React.useState(false);

  React.useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  const toggleSidebar = React.useCallback(() => {
    if (isMobile) {
      setOpenMobile((v) => !v);
    } else {
      setOpen((v) => !v);
    }
  }, [isMobile]);

  const state = open ? "expanded" : "collapsed";

  return (
    <SidebarContext.Provider
      value={{ open, setOpen, openMobile, setOpenMobile, isMobile, toggleSidebar, state }}
    >
      <div
        className="group/sidebar-wrapper flex min-h-svh w-full"
        style={
          {
            "--sidebar-width": SIDEBAR_WIDTH,
            "--sidebar-width-icon": SIDEBAR_WIDTH_ICON,
            "--sidebar-width-mobile": SIDEBAR_WIDTH_MOBILE,
          } as React.CSSProperties
        }
      >
        {children}
      </div>
    </SidebarContext.Provider>
  );
}

export const Sidebar = React.forwardRef<
  HTMLDivElement,
  React.ComponentProps<"div"> & {
    side?: "left" | "right";
    variant?: "sidebar" | "floating" | "inset";
    collapsible?: "offcanvas" | "icon" | "none";
  }
>(({ side = "left", variant = "sidebar", collapsible = "icon", className, children, ...props }, ref) => {
  const { isMobile, openMobile, setOpenMobile, open, state } = useSidebar();

  if (isMobile) {
    return (
      <>
        {openMobile && (
          <div
            className="fixed inset-0 z-40 bg-black/50"
            onClick={() => setOpenMobile(false)}
          />
        )}
        <div
          ref={ref}
          data-state={openMobile ? "open" : "closed"}
          className={cn(
            "fixed inset-y-0 z-50 flex h-svh w-[var(--sidebar-width-mobile)] flex-col border-r bg-sidebar p-0 text-sidebar-foreground transition-transform duration-300 ease-in-out",
            side === "left" ? "left-0" : "right-0",
            openMobile ? "translate-x-0" : side === "left" ? "-translate-x-full" : "translate-x-full",
            className
          )}
          {...props}
        >
          {children}
        </div>
      </>
    );
  }

  return (
    <div
      ref={ref}
      data-state={state}
      data-collapsible={collapsible}
      data-variant={variant}
      data-side={side}
      className={cn(
        "hidden h-svh w-[var(--sidebar-width)] flex-col border-r bg-sidebar text-sidebar-foreground transition-[width] duration-200 ease-linear md:flex",
        !open && "w-[var(--sidebar-width-icon)]",
        variant === "floating" && "m-2 rounded-lg border",
        variant === "inset" && "m-2 rounded-lg",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
});
Sidebar.displayName = "Sidebar";

export const SidebarTrigger = React.forwardRef<HTMLButtonElement, React.ComponentProps<"button">>(
  ({ className, ...props }, ref) => {
    const { toggleSidebar } = useSidebar();
    return (
      <button
        ref={ref}
        type="button"
        onClick={toggleSidebar}
        className={cn(
          "inline-flex h-9 w-9 items-center justify-center rounded-md text-sm font-medium transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
          className
        )}
        {...props}
      >
        <PanelLeftIcon className="h-5 w-5" />
        <span className="sr-only">Toggle Sidebar</span>
      </button>
    );
  }
);
SidebarTrigger.displayName = "SidebarTrigger";

export const SidebarHeader = React.forwardRef<HTMLDivElement, React.ComponentProps<"div">>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn("flex flex-col gap-2 p-2", className)}
      {...props}
    />
  )
);
SidebarHeader.displayName = "SidebarHeader";

export const SidebarContent = React.forwardRef<HTMLDivElement, React.ComponentProps<"div">>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn("flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto overflow-x-hidden p-2", className)}
      {...props}
    />
  )
);
SidebarContent.displayName = "SidebarContent";

export const SidebarFooter = React.forwardRef<HTMLDivElement, React.ComponentProps<"div">>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("flex flex-col gap-2 p-2", className)} {...props} />
  )
);
SidebarFooter.displayName = "SidebarFooter";

export const SidebarGroup = React.forwardRef<HTMLDivElement, React.ComponentProps<"div">>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("flex flex-col gap-1", className)} {...props} />
  )
);
SidebarGroup.displayName = "SidebarGroup";

export const SidebarGroupLabel = React.forwardRef<HTMLDivElement, React.ComponentProps<"div">>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        "flex h-8 shrink-0 items-center rounded-md px-2 text-xs font-medium text-sidebar-foreground/70 outline-none transition-[margin,opa] duration-200 ease-linear",
        "group-data-[collapsible=icon]:-mt-8 group-data-[collapsible=icon]:opacity-0",
        className
      )}
      {...props}
    />
  )
);
SidebarGroupLabel.displayName = "SidebarGroupLabel";

export const SidebarMenu = React.forwardRef<HTMLUListElement, React.ComponentProps<"ul">>(
  ({ className, ...props }, ref) => (
    <ul ref={ref} className={cn("flex flex-col gap-1", className)} {...props} />
  )
);
SidebarMenu.displayName = "SidebarMenu";

export const SidebarMenuItem = React.forwardRef<HTMLLIElement, React.ComponentProps<"li">>(
  ({ className, ...props }, ref) => (
    <li ref={ref} className={cn("group/menu-item relative", className)} {...props} />
  )
);
SidebarMenuItem.displayName = "SidebarMenuItem";

export const SidebarMenuButton = React.forwardRef<
  HTMLButtonElement,
  React.ComponentProps<"button"> & {
    asChild?: boolean;
    isActive?: boolean;
    size?: "default" | "sm";
    tooltip?: string;
  }
>(({ asChild, isActive, size = "default", className, children, ...props }, ref) => {
  const Comp = asChild ? Slot : "button";
  return (
    <Comp
      ref={ref as any}
      data-size={size}
      data-active={isActive}
      className={cn(
        "flex w-full items-center gap-2 overflow-hidden rounded-md p-2 text-left text-sm outline-none transition-[width,height,padding] hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-1 focus-visible:ring-sidebar-ring active:bg-sidebar-accent active:text-sidebar-accent-foreground disabled:pointer-events-none disabled:opacity-50",
        size === "default" && "h-9",
        size === "sm" && "h-8",
        isActive && "bg-sidebar-accent text-sidebar-accent-foreground",
        "group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0",
        className
      )}
      {...props}
    >
      {children}
    </Comp>
  );
});
SidebarMenuButton.displayName = "SidebarMenuButton";

export const SidebarMenuSub = React.forwardRef<HTMLUListElement, React.ComponentProps<"ul">>(
  ({ className, ...props }, ref) => (
    <ul
      ref={ref}
      className={cn(
        "mx-3.5 flex min-w-0 translate-x-px flex-col gap-1 border-l border-sidebar-border px-2.5 py-0.5",
        "group-data-[collapsible=icon]:hidden",
        className
      )}
      {...props}
    />
  )
);
SidebarMenuSub.displayName = "SidebarMenuSub";

export const SidebarMenuSubButton = React.forwardRef<
  HTMLAnchorElement,
  React.ComponentProps<"a"> & { asChild?: boolean; isActive?: boolean }
>(({ asChild, isActive, className, ...props }, ref) => {
  const Comp = asChild ? Slot : "a";
  return (
    <Comp
      ref={ref as any}
      data-active={isActive}
      className={cn(
        "flex h-7 min-w-0 -translate-x-px items-center gap-2 overflow-hidden rounded-md px-2 text-sidebar-foreground outline-none ring-sidebar-ring hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 active:bg-sidebar-accent active:text-sidebar-accent-foreground disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50 [&>span:last-child]:truncate",
        isActive && "bg-sidebar-accent text-sidebar-accent-foreground",
        className
      )}
      {...props}
    />
  );
});
SidebarMenuSubButton.displayName = "SidebarMenuSubButton";

export const SidebarMenuBadge = React.forwardRef<HTMLDivElement, React.ComponentProps<"div">>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        "pointer-events-none absolute right-1 flex h-5 min-w-5 select-none items-center justify-center rounded-md px-1 text-xs font-medium tabular-nums text-sidebar-foreground",
        "peer-data-[active=true]/menu-button:bg-sidebar-accent peer-data-[active=true]/menu-button:text-sidebar-accent-foreground",
        className
      )}
      {...props}
    />
  )
);
SidebarMenuBadge.displayName = "SidebarMenuBadge";

export const SidebarRail = React.forwardRef<HTMLDivElement, React.ComponentProps<"div">>(
  ({ className, ...props }, ref) => {
    const { toggleSidebar } = useSidebar();
    return (
      <div
        ref={ref}
        onClick={toggleSidebar}
        className={cn(
          "absolute inset-y-0 z-20 hidden w-4 -translate-x-1/2 transition-all ease-linear hover:after:bg-sidebar-border group-data-[side=left]:-right-4 group-data-[side=right]:left-0 after:absolute after:inset-y-0 after:start-1/2 after:w-[2px] sm:flex",
          "[&[data-state=collapsed]]:cursor-e-resize [&[data-state=expanded]]:cursor-w-resize",
          className
        )}
        {...props}
      />
    );
  }
);
SidebarRail.displayName = "SidebarRail";

export const SidebarInset = React.forwardRef<HTMLDivElement, React.ComponentProps<"div">>(
  ({ className, ...props }, ref) => (
    <main
      ref={ref}
      className={cn(
        "relative flex min-h-svh flex-1 flex-col bg-background",
        "peer-data-[variant=inset]:min-h-[calc(100svh-theme(spacing.4))] md:peer-data-[variant=inset]:m-2 md:peer-data-[variant=inset]:rounded-xl md:peer-data-[variant=inset]:shadow-sm",
        className
      )}
      {...props}
    />
  )
);
SidebarInset.displayName = "SidebarInset";

function PanelLeftIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <rect width="18" height="18" x="3" y="3" rx="2" />
      <path d="M9 3v18" />
    </svg>
  );
}
