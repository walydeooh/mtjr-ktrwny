import { useState } from "react";
import { useListBookings, getListBookingsQueryKey, useUpdateBooking } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { arSA } from "date-fns/locale";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Calendar } from "@/components/ui/calendar";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { CalendarDays, Clock, User, Phone, CheckCircle, XCircle } from "lucide-react";

export default function Bookings() {
  const [date, setDate] = useState<Date | undefined>(new Date());
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const formattedDate = date ? format(date, 'yyyy-MM-dd') : undefined;

  const { data: bookings, isLoading } = useListBookings(
    { date: formattedDate },
    { query: { queryKey: getListBookingsQueryKey({ date: formattedDate }) } }
  );

  const updateBooking = useUpdateBooking();

  const handleStatusChange = (id: number, status: "confirmed" | "cancelled" | "completed") => {
    updateBooking.mutate(
      { id, data: { status } },
      {
        onSuccess: () => {
          toast({ title: "تم التحديث", description: "تم تحديث حالة الحجز بنجاح" });
          queryClient.invalidateQueries({ queryKey: getListBookingsQueryKey({ date: formattedDate }) });
        }
      }
    );
  };

  const getStatusBadge = (status: string) => {
    switch(status) {
      case 'pending': return <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-200">بانتظار التأكيد</Badge>;
      case 'confirmed': return <Badge variant="default" className="bg-blue-50 text-blue-700 border-blue-200">مؤكد</Badge>;
      case 'completed': return <Badge variant="default" className="bg-green-50 text-green-700 border-green-200">مكتمل</Badge>;
      case 'cancelled': return <Badge variant="destructive">ملغي</Badge>;
      default: return <Badge variant="outline">{status}</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">الحجوزات والمواعيد</h1>
        <p className="text-muted-foreground mt-1">إدارة حجوزات الخدمات والمواعيد</p>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1">
          <Card>
            <CardHeader>
              <CardTitle>تقويم المواعيد</CardTitle>
            </CardHeader>
            <CardContent>
              <Calendar
                mode="single"
                selected={date}
                onSelect={setDate}
                className="rounded-md border mx-auto flex justify-center"
                dir="rtl"
                locale={arSA}
              />
            </CardContent>
          </Card>
        </div>

        <div className="lg:col-span-2 space-y-4">
          <h2 className="text-xl font-bold">
            مواعيد يوم {date ? format(date, "EEEE، d MMMM yyyy", { locale: arSA }) : "المختارة"}
          </h2>

          {isLoading ? (
            <Card>
              <CardContent className="p-8 text-center">
                <div className="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full mx-auto mb-4"></div>
                <p className="text-muted-foreground">جاري تحميل المواعيد...</p>
              </CardContent>
            </Card>
          ) : bookings?.length === 0 ? (
            <Card className="bg-muted/30 border-dashed">
              <CardContent className="p-12 text-center">
                <CalendarDays className="w-12 h-12 text-muted-foreground/50 mx-auto mb-4" />
                <p className="text-lg font-medium">لا توجد حجوزات</p>
                <p className="text-muted-foreground text-sm mt-1">لا يوجد أي حجوزات في هذا اليوم</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {bookings?.map((booking) => (
                <Card key={booking.id} className={booking.status === 'cancelled' ? 'opacity-75' : ''}>
                  <CardContent className="p-4 sm:p-6 flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center">
                    <div className="space-y-3">
                      <div className="flex items-center gap-3">
                        <Badge variant="outline" className="bg-primary/5 text-primary border-primary/20 text-sm py-1">
                          <Clock className="w-3.5 h-3.5 ml-1.5" />
                          {booking.startTime} - {booking.endTime}
                        </Badge>
                        {getStatusBadge(booking.status)}
                      </div>
                      
                      <div>
                        <h3 className="font-bold text-lg">{booking.productName}</h3>
                        <div className="flex flex-wrap gap-4 mt-2 text-sm text-muted-foreground">
                          <div className="flex items-center">
                            <User className="w-4 h-4 ml-1" />
                            {booking.customerName}
                          </div>
                          <div className="flex items-center">
                            <Phone className="w-4 h-4 ml-1" />
                            <span dir="ltr">{booking.customerPhone}</span>
                          </div>
                        </div>
                      </div>
                      
                      {booking.notes && (
                        <p className="text-sm bg-muted p-2 rounded-md italic">
                          ملاحظات: {booking.notes}
                        </p>
                      )}
                    </div>

                    <div className="flex gap-2 w-full sm:w-auto">
                      {booking.status === 'pending' && (
                        <Button 
                          size="sm" 
                          className="flex-1 sm:flex-none bg-blue-600 hover:bg-blue-700"
                          onClick={() => handleStatusChange(booking.id, 'confirmed')}
                        >
                          تأكيد الحجز
                        </Button>
                      )}
                      
                      {booking.status === 'confirmed' && (
                        <Button 
                          size="sm" 
                          className="flex-1 sm:flex-none bg-green-600 hover:bg-green-700"
                          onClick={() => handleStatusChange(booking.id, 'completed')}
                        >
                          <CheckCircle className="w-4 h-4 ml-1" />
                          إكمال
                        </Button>
                      )}
                      
                      {(booking.status === 'pending' || booking.status === 'confirmed') && (
                        <Button 
                          size="sm" 
                          variant="destructive" 
                          className="flex-1 sm:flex-none"
                          onClick={() => handleStatusChange(booking.id, 'cancelled')}
                        >
                          <XCircle className="w-4 h-4 ml-1" />
                          إلغاء
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
