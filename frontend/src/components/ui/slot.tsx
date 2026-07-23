import * as React from "react";

function getElementRef(element: React.ReactElement) {
  return (element as any).ref;
}

function mergeProps(slotProps: Record<string, any>, childProps: Record<string, any>) {
  const overrideProps = { ...childProps };

  for (const propName in childProps) {
    const slotPropValue = slotProps[propName];
    const childPropValue = childProps[propName];

    const isHandler = /^on[A-Z]/.test(propName);
    if (isHandler) {
      if (slotPropValue && childPropValue) {
        overrideProps[propName] = (...args: unknown[]) => {
          childPropValue(...args);
          slotPropValue(...args);
        };
      } else if (slotPropValue) {
        overrideProps[propName] = slotPropValue;
      }
    } else if (propName === "style") {
      overrideProps[propName] = { ...slotPropValue, ...childPropValue };
    } else if (propName === "className") {
      overrideProps[propName] = [slotPropValue, childPropValue].filter(Boolean).join(" ");
    }
  }

  return { ...slotProps, ...overrideProps };
}

export const Slot = React.forwardRef<HTMLElement, React.HTMLAttributes<HTMLElement> & { children?: React.ReactNode }>(
  ({ children, ...props }, forwardedRef) => {
    if (React.isValidElement(children)) {
      const childRef = getElementRef(children);
      return React.cloneElement(children, {
        ...mergeProps(props, children.props as any),
        ref: forwardedRef
          ? (instance: HTMLElement | null) => {
              if (typeof forwardedRef === "function") {
                forwardedRef(instance);
              } else {
                (forwardedRef as React.MutableRefObject<HTMLElement | null>).current = instance;
              }
              if (typeof childRef === "function") {
                childRef(instance);
              } else if (childRef !== null) {
                (childRef as React.MutableRefObject<HTMLElement | null>).current = instance;
              }
            }
          : childRef,
      } as any);
    }

    if (React.Children.count(children) > 1) {
      React.Children.only(children);
    }

    return null;
  }
);
Slot.displayName = "Slot";
