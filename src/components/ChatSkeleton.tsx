import { Skeleton } from '@heroui/react';

export function ChatSkeleton() {
  return (
    <div className="w-full h-full flex flex-col justify-end p-4 space-y-4">
      {/* Sent Message Skeleton */}
      <div className="flex justify-end">
        <div className="max-w-[70%]">
          <Skeleton className="rounded-2xl rounded-tr-sm bg-industrial-800">
            <div className="h-16 w-48 rounded-lg bg-default-300"></div>
          </Skeleton>
        </div>
      </div>

      {/* Received Message Skeleton */}
      <div className="flex justify-start">
        <div className="max-w-[70%]">
          <Skeleton className="rounded-2xl rounded-tl-sm bg-industrial-800">
             <div className="h-12 w-36 rounded-lg bg-default-300"></div>
          </Skeleton>
        </div>
      </div>

       {/* Sent Message Skeleton */}
      <div className="flex justify-end">
        <div className="max-w-[70%]">
          <Skeleton className="rounded-2xl rounded-tr-sm bg-industrial-800">
            <div className="h-24 w-64 rounded-lg bg-default-300"></div>
          </Skeleton>
        </div>
      </div>

       {/* Received Message Skeleton */}
      <div className="flex justify-start">
        <div className="max-w-[70%]">
          <Skeleton className="rounded-2xl rounded-tl-sm bg-industrial-800">
             <div className="h-10 w-24 rounded-lg bg-default-300"></div>
          </Skeleton>
        </div>
      </div>
       {/* Sent Message Skeleton */}
      <div className="flex justify-end">
        <div className="max-w-[70%]">
           <Skeleton className="rounded-2xl rounded-tr-sm bg-industrial-800">
             <div className="h-12 w-40 rounded-lg bg-default-300"></div>
           </Skeleton>
        </div>
      </div>
    </div>
  );
}
