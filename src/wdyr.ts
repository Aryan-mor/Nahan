/// <reference types="@welldone-software/why-did-you-render" />
import React from 'react';

if (import.meta.env.DEV) {
    if (typeof window !== 'undefined') {
        const whyDidYouRender = await import('@welldone-software/why-did-you-render');
        whyDidYouRender.default(React, {
            trackAllPureComponents: false,
            trackHooks: true,
            logOnDifferentValues: true,
            collapseGroups: true,
            include: [
                /App/,
                /ChatList/,
                /ChatView/
            ]
        });
    }
}
