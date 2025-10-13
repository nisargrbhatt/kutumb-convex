"use client";
import { useParams } from "next/navigation";
import type { FC } from "react";

interface Props {}

const MemoryDetailPage: FC<Props> = () => {
  const {id} = useParams();
  

  return <div></div>;
};

export default MemoryDetailPage;
