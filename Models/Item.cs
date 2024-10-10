namespace WebApplication2.Models
{
    public class Item
    {
        public int Id { get; set; }
        public string Name { get; set; } = string.Empty; 
        public string Recipient { get; set; } = string.Empty; 
        public string Supplier { get; set; } = string.Empty; 
        public decimal Price { get; set; }
        public string ItemType { get; set; } = string.Empty; 
    }
}
