"use client";

import { FC } from 'react';
import { Bot, LogOut } from "lucide-react";
import { Button } from './ui/button';

interface HeaderProps {
    userId: string | null;
}

export const Header: FC<HeaderProps> = ({ userId }) => {
    return (
        <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
            <div className="container flex h-14 items-center">
                <div className="mr-4 hidden md:flex">
                    <a className="mr-6 flex items-center space-x-2" href="/">
                        <Bot className="h-6 w-6" />
                        <span className="hidden font-bold sm:inline-block">
                            Data Alchemist
                        </span>
                    </a>
                </div>
                {userId && (
                    <div className="flex flex-1 items-center justify-end space-x-2">
                        <p className="text-sm text-muted-foreground hidden md:block">
                            <span className="font-semibold">User ID:</span> {userId}
                        </p>
                         <Button variant="ghost" size="icon" onClick={() => window.location.reload()}>
                             <LogOut className="h-4 w-4" />
                             <span className="sr-only">Sign Out / Refresh Session</span>
                         </Button>
                    </div>
                )}
            </div>
        </header>
    );
};